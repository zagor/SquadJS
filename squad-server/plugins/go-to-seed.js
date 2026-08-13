import BasePlugin from './base-plugin.js';
import { Layers } from '../layers/index.js';

export default class GoToSeed extends BasePlugin {
  static get description() {
    return (
      "The <code>GoToSeed</code> plugin sets a seed layer when player count drops below a limit."
    );
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
        default: 120
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onTimerExpiry = this.onTimerExpiry.bind(this);
    this.timer = setInterval(this.onTimerExpiry, this.options.check_interval * 1000);
  }

  async mount() {
    if (this.options.randomize_layers) {
      this.layer_list = Layers.layers.filter((l) => l.gamemode == "Seed");
    }
  }

  async unmount() {
  }

  randomizeLayer() {
    const layerNum = Math.floor(Math.random() * this.layer_list.length);
    const layer = this.layer_list[layerNum];
    return layer.classname;
  }

  randomizeFactions(layerName) {
    const layer = Layers.layers.filter((l) => l.classname == layerName)[0];
    if (!layer) {
      this.verbose(1, 'Could not find layer', layerName);
      return undefined;
    }
    const faction1Num = Math.floor(Math.random() * layer.factions.length);
    let faction2Num = undefined;
    do {
      faction2Num = Math.floor(Math.random() * layer.factions.length);
    } while (faction2Num == faction1Num);

    return `${layer.factions[faction1Num].factionId} ${layer.factions[faction2Num].factionId}`;
  }

  async onTimerExpiry() {
    if (!this.server.currentLayer || this.server.currentLayer.name.toLowerCase().includes('seed'))
      return;

    const players = this.server.players.length;
    if (players > 0 && players < this.options.player_limit) {
      let layer = undefined;
      let factions = this.options.factions;
      if (this.options.randomize_layers)
        layer = this.randomizeLayer();
      else
        layer = this.options.seed_layer;
      if (this.options.randomize_factions)
        factions = this.randomizeFactions(layer);
      else
        factions = this.options.factions;
      if (layer && factions) {
        this.verbose(1, `Only ${this.server.players.length} players, going to ${layer} with ${factions}`);
        await this.server.rcon.execute(`AdminChangeLayer ${layer} ${factions}`);
      }
      else {
        this.verbose(1, 'Something went wrong, got layer/factions:', layer, factions);
      }
    }
  }
}
