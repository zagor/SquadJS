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
      use_all_layers: {
        required: false,
        description: 'Use all seed layers.',
        default: false
      },
      seed_layer: {
        required: false,
        description: 'Name of seed layer.',
        default: 'Sumari_Seed_v1 USA RGF'
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
    if (this.options.use_all_layers) {
      this.layer_list = Layers.layers.filter((l) => l.gamemode == "Seed");
    }
  }

  async unmount() {
  }

  randomizeLayer() {
    const layerNum = Math.floor(Math.random() * this.layer_list.length);
    const layer = this.layer_list[layerNum];
    const faction1Num = Math.floor(Math.random() * layer.factions.length);
    let faction2Num = undefined;
    do {
      faction2Num = Math.floor(Math.random() * layer.factions.length);
    } while (faction2Num == faction1Num);

    return `${layer.classname} ${layer.factions[faction1Num].factionId} ${layer.factions[faction2Num].factionId}`;
  }


  async onTimerExpiry() {
    if (this.server.currentLayer.name.toLowerCase().includes('seed'))
      return;

    const players = this.server.players.length;
    if (players > 0 && players < this.options.player_limit) {
      let layer = undefined;
      if (this.options.use_all_layers)
        layer = this.randomizeLayer();
      else
        layer = this.options.seed_layer;
      this.verbose(1, `Only ${this.server.players.length} players, going to ${layer}`);
      await this.server.rcon.execute(`AdminChangeLayer ${layer}`);
    }
  }
}
