import Tour from "../tour.mjs";

/**
 * A tour for demonstrating an aspect of Canvas functionality.
 * Automatically activates a certain canvas layer or tool depending on the needs of the step.
 */
export default class CanvasTour extends Tour {

  /** @override */
  async start() {
    game.togglePause(false);
    await super.start();
  }

  /* -------------------------------------------- */

  /** @override */
  get canStart() {
    return !!canvas.scene;
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();
    this.#activateTool();
  }

  /* -------------------------------------------- */

  /**
   * Activate a canvas layer and control for each step
   */
  #activateTool() {
    if ( "layer" in this.currentStep && canvas.scene ) {
      ui.controls.activate({control: this.currentStep.layer, tool: this.currentStep.tool});
    }
  }
}
