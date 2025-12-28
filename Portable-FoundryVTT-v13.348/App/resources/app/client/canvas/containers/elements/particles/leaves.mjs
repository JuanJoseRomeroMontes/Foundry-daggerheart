import ParticleEffect from "./particle-effect.mjs";

/**
 * A full-screen weather effect which renders gently falling autumn leaves.
 * @extends {ParticleEffect}
 */
export default class AutumnLeavesWeatherEffect extends ParticleEffect {

  /** @inheritdoc */
  static label = "WEATHER.AutumnLeaves";

  /**
   * Configuration for the particle emitter for falling leaves
   * @type {PIXI.particles.EmitterConfigV3}
   */
  static LEAF_CONFIG = {
    lifetime: {min: 10, max: 10},
    behaviors: [
      {
        type: "alpha",
        config: {
          alpha: {
            list: [{time: 0, value: 0.9}, {time: 1, value: 0.5}]
          }
        }
      },
      {
        type: "moveSpeed",
        config: {
          speed: {
            list: [{time: 0, value: 20}, {time: 1, value: 60}]
          },
          minMult: 0.6
        }
      },
      {
        type: "scale",
        config: {
          scale: {
            list: [{time: 0, value: 0.2}, {time: 1, value: 0.4}]
          },
          minMult: 0.5
        }
      },
      {
        type: "rotation",
        config: {accel: 0, minSpeed: 100, maxSpeed: 200, minStart: 0, maxStart: 365}
      },
      {
        type: "textureRandom",
        config: {
          textures: Array.fromRange(6).map(n => `ui/particles/leaf${n + 1}.png`)
        }
      }
    ]
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  getParticleEmitters() {
    const d = canvas.dimensions;
    const maxParticles = (d.width / d.size) * (d.height / d.size) * 0.25;
    const config = foundry.utils.deepClone(this.constructor.LEAF_CONFIG);
    config.maxParticles = maxParticles;
    config.frequency = config.lifetime.min / maxParticles;
    config.behaviors.push({
      type: "spawnShape",
      config: {
        type: "rect",
        data: {x: d.sceneRect.x, y: d.sceneRect.y, w: d.sceneRect.width, h: d.sceneRect.height}
      }
    });
    return [this.createEmitter(config)];
  }
}
