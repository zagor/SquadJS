import BasePlugin from './base-plugin.js';
import { Layers } from '../layers/index.js';

const CHANGE_COOLDOWN_MS = 120 * 1000;

export default class GoToSeed extends BasePlugin {
  static get description() {
    return 'The <code>GoToSeed</code> plugin sets a seed layer when player count drops below a limit.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      player_limit: {
        required: false,
        description: 'Number of players under which seed is started.',
        default: 10
      },
      randomize_layers: {
        required: false,
        description: 'Use random seed layer.',
        default: false
      },
      randomize_factions: {
        required: false,
        description: 'Use random factions from chosen seed layer.',
        default: false
      },
      factions: {
        required: false,
        description: 'Factions to use if not random.',
        default: 'USA RGF'
      },
      seed_layer: {
        required: false,
        description: 'Seed layer to use if not random.',
        default: 'Sumari_Seed_v1'
      },
      check_interval: {
        required: false,
        description: 'Interval to run check, in seconds.',
        default: 30
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onTimerExpiry = this.onTimerExpiry.bind(this);
    this.timer = setInterval(this.onTimerExpiry, this.options.check_interval * 1000);
    this.lastChange = 0;
  }

  async mount() {
    if (this.options.randomize_layers) {
      this.layer_list = Layers.layers.filter((l) => l.gamemode === 'Seed');
    }
  }

  async unmount() {
  }

  randomizeLayer() {
    if (!this.layer_list || this.layer_list.length === 0) {
      this.verbose(1, 'No seed layers available to randomize');
      return undefined;
    }
    const layerNum = Math.floor(Math.random() * this.layer_list.length);
    return this.layer_list[layerNum].classname;
  }

  randomizeFactions(layerName) {
    const layer = Layers.layers.find((l) => l.classname === layerName);
    if (!layer) {
      this.verbose(1, 'Could not find layer', layerName);
      return undefined;
    }
    if (!layer.factions || layer.factions.length < 2) {
      this.verbose(1, 'Layer has fewer than two factions', layerName);
      return undefined;
    }
    const faction1Num = Math.floor(Math.random() * layer.factions.length);
    let faction2Num;
    do {
      faction2Num = Math.floor(Math.random() * layer.factions.length);
    } while (faction2Num === faction1Num);

    return `${layer.factions[faction1Num].factionId} ${layer.factions[faction2Num].factionId}`;
  }

  async onTimerExpiry() {
    // Give the server time to report the new layer before checking again
    if (Date.now() - this.lastChange < CHANGE_COOLDOWN_MS) return;
    const current = this.server.currentLayer;
    if (!current || current.gamemode === 'Seed') return;

    const players = this.server.players.length;
    if (players >= this.options.player_limit) return;

    try {
      const layer = this.options.randomize_layers ? this.randomizeLayer() : this.options.seed_layer;
      const factions =
        layer && this.options.randomize_factions
          ? this.randomizeFactions(layer)
          : this.options.factions;
      if (!layer || !factions) {
        this.verbose(1, 'Something went wrong, got layer/factions:', layer, factions);
        return;
      }
      this.verbose(1, `${players} players, going to ${layer} with ${factions}`);
      this.lastChange = Date.now();
      await this.server.rcon.execute(`AdminChangeLayer ${layer} ${factions}`);
    } catch (err) {
      this.verbose(1, 'Failed to change layer:', err);
    }
  }
}
