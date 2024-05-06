/**
 * The Controller part in MVC pattern
 */
'use strict';
import { GROUND_HALF_WIDTH, PikaPhysics, PikaUserInput } from './physics.js';
import { MenuView, GameView, FadeInOut, IntroView } from './view.js';
import { PikaKeyboard } from './keyboard.js';
import { replaySaver } from './replay/replay_saver.js';
import seedrandom from 'seedrandom';
import { true_rand, setCustomRng, rand } from './rand.js';
import { Cloud, Wave } from './cloud_and_wave.js';

/** @typedef GameState @type {function():void} */

/**
 * Class representing Pikachu Volleyball game
 */
export class PikachuVolleyball {
  /**
   * Create a Pikachu Volleyball game which includes physics, view, audio
   * @param {PIXI.Container} stage container which is rendered by PIXI.Renderer or PIXI.CanvasRenderer
   * @param {Object.<string,PIXI.LoaderResource>} resources resources property of the PIXI.Loader object which is used for loading the game resources
   */
  constructor(stage, resources) {
    this.view = {
      intro: new IntroView(resources),
      menu: new MenuView(resources),
      game: new GameView(resources),
      fadeInOut: new FadeInOut(),
    };
    stage.addChild(this.view.intro.container);
    stage.addChild(this.view.menu.container);
    stage.addChild(this.view.game.container);
    stage.addChild(this.view.fadeInOut.black);
    this.view.intro.visible = false;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    this.view.fadeInOut.visible = false;

    this.physics = new PikaPhysics(true, true);
    this.keyboardArray = [
      new PikaKeyboard('KeyD', 'KeyG', 'KeyR', 'KeyV', 'KeyZ', 'KeyF'), // for player1
      new PikaKeyboard( // for player2
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter'
      ),
    ];

    /** @type {number} game fps */
    this.normalFPS = 30;
    /** @type {number} fps for slow motion */
    this.slowMotionFPS = 5;

    /** @constant @type {number} number of frames for slow motion */
    this.SLOW_MOTION_FRAMES_NUM = 6;
    /** @type {number} number of frames left for slow motion */
    this.slowMotionFramesLeft = 0;
    /** @type {number} number of elapsed normal fps frames for rendering slow motion */
    this.slowMotionNumOfSkippedFrames = 0;

    /** @type {number} 0: with computer, 1: with friend */
    this.selectedWithWho = 0;

    /** @type {number[]} [0] for player 1 score, [1] for player 2 score */
    this.scores = [0, 0];
    /** @type {number} winning score: if either one of the players reaches this score, game ends */
    this.winningScore = 15;

    /** @type {boolean} Is the game ended? */
    this.gameEnded = false;
    /** @type {boolean} Is the round ended? */
    this.roundEnded = false;
    /** @type {boolean} Will player 2 serve? */
    this.isPlayer2Serve = false;

    /** @type {number} frame counter */
    this.frameCounter = 0;
    /** @type {Object.<string,number>} total number of frames for each game state */
    this.frameTotal = {
      intro: 165,
      afterMenuSelection: 15,
      beforeStartOfNewGame: 15,
      startOfNewGame: 71,
      afterEndOfRound: 5,
      beforeStartOfNextRound: 30,
      gameEnd: 211,
    };

    /** @type {number} counter for frames while there is no input from keyboard */
    this.noInputFrameCounter = 0;
    /** @type {Object.<string,number>} total number of frames to be rendered while there is no input */
    this.noInputFrameTotal = {
      menu: 225,
    };

    /** @type {boolean} true: paused, false: not paused */
    this.paused = false;

    /** @type {boolean} true: stereo, false: mono */
    this.isStereoSound = true;

    /** @type {boolean} true: practice mode on, false: practice mode off */
    this._isPracticeMode = false;
    this.stateArr = [
      'intro',
      'menu',
      'afterMenuSelection',
      'beforeStartOfNewGame',
      'startOfNewGame',
      'round',
      'afterEndOfRound',
      'beforeStartOfNextRound',
    ];

    /** @type {number} current state */
    this.stateIdx = 0;
    /**
     * The game state which is being rendered now
     * @type {GameState}
     */
    this.state = this.intro;
  }
  /**
     * Change the innerText of the "state" Element.
     * @param {Number} idx stateIdx
     */
  setDocumentState(idx) {
    this.stateIdx = idx;
    document.getElementById('state').innerText = this.stateArr[idx];
  }

  /**
   * Returns an observation based on player number.
   * @returns {Number[]} Observation Array
   */
  getPlayerObservation() {
    const p1 = this.physics.player1;
    const p2 = this.physics.player2;
    const ball = this.physics.ball;
    const p1Observation = [
      p1.x,
      p1.y,
      p1.yVelocity,
      p1.divingDirection,
      p1.lyingDownDurationLeft,
      p1.frameNumber,
      p1.delayBeforeNextFrame,
      Number(this.keyboardArray[0].powerHitKeyIsDownPrevious),
      p1.state,
    ];
    const p2Observation = [
      p2.x,
      p2.y,
      p2.yVelocity,
      p2.divingDirection,
      p2.lyingDownDurationLeft,
      p2.frameNumber,
      p2.delayBeforeNextFrame,
      Number(this.keyboardArray[1].powerHitKeyIsDownPrevious),
      p2.state,
    ];
    const ballObservation = [
      ball.x,
      ball.y,
      ball.previousX,
      ball.previousY,
      ball.previousPreviousX,
      ball.previousPreviousY,
      ball.xVelocity,
      ball.yVelocity,
      Number(ball.isPowerHit),
    ];
    const result = p1Observation.concat(p2Observation, ballObservation);

    return result;
  }
  /**
   * Game loop
   * This function should be called at regular intervals ( interval = (1 / FPS) second )
   */
  gameLoop() {
    if (this.paused === true) {
      return;
    }

    // catch keyboard input and freeze it
    this.keyboardArray[0].getInput();
    this.keyboardArray[1].getInput();

    const player1Input = new PikaUserInput();
    player1Input.xDirection = this.keyboardArray[0].xDirection;
    player1Input.yDirection = this.keyboardArray[0].yDirection;
    player1Input.powerHit = this.keyboardArray[0].powerHit;
    const player2Input = new PikaUserInput();
    player2Input.xDirection = this.keyboardArray[1].xDirection;
    player2Input.yDirection = this.keyboardArray[1].yDirection;
    player2Input.powerHit = this.keyboardArray[1].powerHit;
    if (this.state !== this.round) {
      replaySaver.recordInputs(player1Input, player2Input);
    }
    if (this.slowMotionFramesLeft > 0) {
      this.slowMotionNumOfSkippedFrames++;
      if (
        this.slowMotionNumOfSkippedFrames %
          Math.round(this.normalFPS / this.slowMotionFPS) !==
        0
      ) {
        replaySaver.recordInputs(player1Input, player2Input);
        return;
      }
      this.slowMotionFramesLeft--;
      this.slowMotionNumOfSkippedFrames = 0;
    }
    this.state();
    document.getElementById('observation').innerText =
    this.getPlayerObservation().toString();
  }

  /**
   * Intro: a man with a brief case
   * @type {GameState}
   */
  intro() {
    this.setDocumentState(0);
    if (this.frameCounter === 0) {
      this.view.intro.visible = true;
      this.view.fadeInOut.setBlackAlphaTo(0);
    }
    this.view.intro.drawMark(this.frameCounter);
    this.frameCounter++;

    if (
      this.keyboardArray[0].powerHit === 1 ||
      this.keyboardArray[1].powerHit === 1
    ) {
      this.frameCounter = 0;
      this.view.intro.visible = false;
      this.state = this.menu;
    }

    if (this.frameCounter >= this.frameTotal.intro) {
      this.frameCounter = 0;
      this.view.intro.visible = false;
      this.state = this.menu;
    }
  }

  /**
   * Menu: select who do you want to play. With computer? With friend?
   * @type {GameState}
   */
  menu() {
    this.setDocumentState(1);
    if (this.frameCounter === 0) {
      this.view.menu.visible = true;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.selectedWithWho = 0;
      this.view.menu.selectWithWho(this.selectedWithWho);
    }
    this.view.menu.drawFightMessage(this.frameCounter);
    this.view.menu.drawSachisoft(this.frameCounter);
    this.view.menu.drawSittingPikachuTiles(this.frameCounter);
    this.view.menu.drawPikachuVolleyballMessage(this.frameCounter);
    this.view.menu.drawPokemonMessage(this.frameCounter);
    this.view.menu.drawWithWhoMessages(this.frameCounter);
    this.frameCounter++;

    if (
      this.frameCounter < 71 &&
      (this.keyboardArray[0].powerHit === 1 ||
        this.keyboardArray[1].powerHit === 1)
    ) {
      this.frameCounter = 71;
      return;
    }

    if (this.frameCounter <= 71) {
      return;
    }

    if (
      (this.keyboardArray[0].yDirection === -1 ||
        this.keyboardArray[1].yDirection === -1) &&
      this.selectedWithWho === 1
    ) {
      this.noInputFrameCounter = 0;
      this.selectedWithWho = 0;
      this.view.menu.selectWithWho(this.selectedWithWho);
    } else if (
      (this.keyboardArray[0].yDirection === 1 ||
        this.keyboardArray[1].yDirection === 1) &&
      this.selectedWithWho === 0
    ) {
      this.noInputFrameCounter = 0;
      this.selectedWithWho = 1;
      this.view.menu.selectWithWho(this.selectedWithWho);
    } else {
      this.noInputFrameCounter++;
    }

    if (
      this.keyboardArray[0].powerHit === 1 ||
      this.keyboardArray[1].powerHit === 1
    ) {
      if (this.selectedWithWho === 1) {
        this.physics.player1.isComputer = true;
        this.physics.player2.isComputer = true;
        replaySaver.recordNicknames('AI', 'AI');
      } else {
        if (this.keyboardArray[0].powerHit === 1) {
          this.physics.player1.isComputer = false;
          this.physics.player2.isComputer = true;
          replaySaver.recordNicknames('Player', 'AI');
        } else if (this.keyboardArray[1].powerHit === 1) {
          this.physics.player1.isComputer = true;
          this.physics.player2.isComputer = false;
          replaySaver.recordNicknames('AI', 'Player');
        }
      }
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.state = this.afterMenuSelection;
      return;
    }

    // if (this.noInputFrameCounter >= this.noInputFrameTotal.menu) {
    //   this.physics.player1.isComputer = true;
    //   this.physics.player2.isComputer = true;
    //   this.frameCounter = 0;
    //   this.noInputFrameCounter = 0;
    //   this.state = this.afterMenuSelection;
    // }
  }

  /**
   * Fade out after menu selection
   * @type {GameState}
   */
  afterMenuSelection() {
    this.setDocumentState(2);
    this.view.fadeInOut.changeBlackAlphaBy(1 / 16);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.afterMenuSelection) {
      this.frameCounter = 0;
      this.state = this.beforeStartOfNewGame;
    }
  }

  /**
   * Delay before start of new game (This is for the dalay that exist in the original game)
   * @type {GameState}
   */
  beforeStartOfNewGame() {
    this.setDocumentState(3);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.beforeStartOfNewGame) {
      this.frameCounter = 0;
      this.view.menu.visible = false;
      this.state = this.startOfNewGame;
    }
  }

  /**
   * Start of new game: Initialize ball and players and print game start message
   * @type {GameState}
   */
  startOfNewGame() {
    this.setDocumentState(4);
    if (this.frameCounter === 0) {
      this.view.game.visible = true;
      this.gameEnded = false;
      this.roundEnded = false;
      this.isPlayer2Serve = false;
      this.physics.player1.gameEnded = false;
      this.physics.player1.isWinner = false;
      this.physics.player2.gameEnded = false;
      this.physics.player2.isWinner = false;

      this.scores[0] = 0;
      this.scores[1] = 0;
      this.view.game.drawScoresToScoreBoards(this.scores);

      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.view.game.drawPlayersAndBall(this.physics);

      this.view.fadeInOut.setBlackAlphaTo(1); // set black screen
    }

    this.view.game.drawGameStartMessage(
      this.frameCounter,
      this.frameTotal.startOfNewGame
    );
    this.view.game.drawCloudsAndWave();
    this.view.fadeInOut.changeBlackAlphaBy(-(1 / 17)); // fade in
    this.frameCounter++;

    if (this.frameCounter >= this.frameTotal.startOfNewGame) {
      this.frameCounter = 0;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.state = this.round;
    }
  }

  /**
   * Round: the players play volleyball in this game state
   * @type {GameState}
   */
  round() {
    this.setDocumentState(5);
    const pressedPowerHit =
      this.keyboardArray[0].powerHit === 1 ||
      this.keyboardArray[1].powerHit === 1;

    // if (
    //   this.physics.player1.isComputer === true &&
    //   this.physics.player2.isComputer === true &&
    //   pressedPowerHit
    // ) {
    //   this.frameCounter = 0;
    //   this.view.game.visible = false;
    //   this.state = this.intro;
    //   return;
    // }
    const PlayerMove = this.gameEnded && this.frameCounter >= 70;
    if (PlayerMove) {
      replaySaver.recordInputs(this.keyboardArray[0], this.keyboardArray[1]);
    }
    const isBallTouchingGround = this.physics.runEngineForNextFrame(
      this.keyboardArray
    );
    if (!PlayerMove) {
      replaySaver.recordInputs(this.keyboardArray[0], this.keyboardArray[1]);
    }

    this.playSoundEffect();
    this.view.game.drawPlayersAndBall(this.physics);
    this.view.game.drawCloudsAndWave();

    if (this.gameEnded === true) {
      this.view.game.drawGameEndMessage(this.frameCounter);
      this.frameCounter++;
      if (
        this.frameCounter >= this.frameTotal.gameEnd ||
        (this.frameCounter >= 70 && pressedPowerHit)
      ) {
        this.frameCounter = 0;
        this.view.game.visible = false;
        this.state = this.intro;
      }
      return;
    }

    if (
      isBallTouchingGround &&
      this._isPracticeMode === false &&
      this.roundEnded === false &&
      this.gameEnded === false
    ) {
      if (this.physics.ball.punchEffectX < GROUND_HALF_WIDTH) {
        this.isPlayer2Serve = true;
        this.scores[1] += 1;
        if (this.scores[1] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = false;
          this.physics.player2.isWinner = true;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      } else {
        this.isPlayer2Serve = false;
        this.scores[0] += 1;
        if (this.scores[0] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = true;
          this.physics.player2.isWinner = false;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      }
      this.view.game.drawScoresToScoreBoards(this.scores);
      if (this.roundEnded === false && this.gameEnded === false) {
        this.slowMotionFramesLeft = this.SLOW_MOTION_FRAMES_NUM;
      }
      this.roundEnded = true;
    }

    if (this.roundEnded === true && this.gameEnded === false) {
      // if this is the last frame of this round, begin fade out
      if (this.slowMotionFramesLeft === 0) {
        this.view.fadeInOut.changeBlackAlphaBy(1 / 16); // fade out
        this.state = this.afterEndOfRound;
      }
    }
  }

  /**
   * Fade out after end of round
   * @type {GameState}
   */
  afterEndOfRound() {
    this.setDocumentState(6);
    this.view.fadeInOut.changeBlackAlphaBy(1 / 16);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.afterEndOfRound) {
      this.frameCounter = 0;
      this.state = this.beforeStartOfNextRound;
    }
  }

  /**
   * Before start of next round, initialize ball and players, and print ready message
   * @type {GameState}
   */
  beforeStartOfNextRound() {
    this.setDocumentState(7);
    if (this.frameCounter === 0) {
      this.view.fadeInOut.setBlackAlphaTo(1);
      this.view.game.drawReadyMessage(false);

      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.view.game.drawPlayersAndBall(this.physics);
    }

    this.view.game.drawCloudsAndWave();
    this.view.fadeInOut.changeBlackAlphaBy(-(1 / 16));

    this.frameCounter++;
    if (this.frameCounter % 5 === 0) {
      this.view.game.toggleReadyMessage();
    }

    if (this.frameCounter >= this.frameTotal.beforeStartOfNextRound) {
      this.frameCounter = 0;
      this.view.game.drawReadyMessage(false);
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.roundEnded = false;
      this.state = this.round;
    }
  }

  /**
   * Play sound effect on {@link round}
   */
  playSoundEffect() {
    for (let i = 0; i < 2; i++) {
      const player = this.physics[`player${i + 1}`];
      const sound = player.sound;
      let leftOrCenterOrRight = 0;
      if (this.isStereoSound) {
        leftOrCenterOrRight = i === 0 ? -1 : 1;
      }
      if (sound.pipikachu === true) {
        sound.pipikachu = false;
      }
      if (sound.pika === true) {
        sound.pika = false;
      }
      if (sound.chu === true) {
        sound.chu = false;
      }
    }
    const ball = this.physics.ball;
    const sound = ball.sound;
    let leftOrCenterOrRight = 0;
    if (this.isStereoSound) {
      if (ball.punchEffectX < GROUND_HALF_WIDTH) {
        leftOrCenterOrRight = -1;
      } else if (ball.punchEffectX > GROUND_HALF_WIDTH) {
        leftOrCenterOrRight = 1;
      }
    }
    if (sound.powerHit === true) {
      sound.powerHit = false;
    }
    if (sound.ballTouchesGround === true) {
      sound.ballTouchesGround = false;
    }
  }

  /**
   * Called if restart button clicked
   */
  restart() {
    this.frameCounter = 0;
    this.noInputFrameCounter = 0;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    this.state = this.intro;
    replaySaver.cleanRecord();
    const roomId = 'DuckLL_AI_GOD_' + true_rand();
    replaySaver.recordRoomID(roomId);
    const customRng = seedrandom.alea(roomId.slice(10));
    setCustomRng(customRng);
    this.view.game.cloudArray = [];
    for (let i = 0; i < 10; i++) {
      this.view.game.cloudArray.push(new Cloud());
    }
    this.view.game.wave = new Wave();
    rand();
    rand();
  }

  /** @return {boolean} */
  get isPracticeMode() {
    return this._isPracticeMode;
  }

  /**
   * @param {boolean} bool true: turn on practice mode, false: turn off practice mode
   */
  set isPracticeMode(bool) {
    this._isPracticeMode = bool;
    this.view.game.scoreBoards[0].visible = !bool;
    this.view.game.scoreBoards[1].visible = !bool;
  }
}
