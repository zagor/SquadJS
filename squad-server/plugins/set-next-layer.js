import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import BasePlugin from './base-plugin.js';

export default class SetNextLayer extends BasePlugin {
  static get description() {
    return (
      "Set next layer according to preferences."
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      layer_rotation_cfg: {
        required: false,
        description: 'Path + filename to the LayerRotation.cfg file',
        default: "LayerRotation.cfg"
      },
      map_repeat_threshold: {
        required: false,
        description: 'How many maps are quarantined?',
        default: 4
      },
      faction_repeat_threshold: {
        required: false,
        description: 'How many factions are quarantined?',
        default: 6
      },
      invasion_repeat_threshold: {
        required: false,
        description: 'How many non-invasion rounds must be played before next invasion?',
        default: 3
      },
      min_players: {
        required: false,
        description: 'How many players must be active for a layer to be counted?',
        default: 10
      },
      command: {
        required: false,
        description: 'The command word used for trigger a new search.',
        default: 'newnextlayer'
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onNewGame = this.onNewGame.bind(this);
    this.onChatCommand = this.onChatCommand.bind(this);
    this.layers = [];
    this.playedMaps = [];
    this.playedFactions = [];
    this.playedInvasion = [];
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    await this.readLayers();
    this.markCurrentLayer();
    await this.setNextLayer();
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`,
                                    this.onChatCommand);
  }

  async readLayers() {
    try {
      const fileStream = createReadStream(this.options.layer_rotation_cfg);
      const rl = createInterface({input: fileStream, crlfDelay: Infinity });
      this.layers = [];
      let count = 0;
      for await (const line of rl) {
        this.layers.push(line);
        count++;
      }
      this.verbose(2, `Read ${count} layers from ${this.options.layer_rotation_cfg}`);
    }
    catch (error) {
      this.verbose(1, '*** error:', error);
    }
  }

  async onNewGame(info) {
    this.markCurrentLayer();
    await this.readLayers();
    await this.setNextLayer();
  }

  markCurrentLayer() {
    try {
      if (this.server.players.length < this.options.min_players) {
        this.verbose(2, 'Only', this.server.players.length, 'players, not marking this as played.');
        return;
      }

      const currRegex = /(\w+)_(\w+)_(\w+) (\w+)_[A-Z]+_([-\w]+) (\w+)_[A-Z]+_([-\w]+)/;
      const currLine = `${this.server.currentLayer.layerid} ${this.server.currentTeams[0].unitID} ${this.server.currentTeams[1].unitID}`;
      const fields = currLine.match(currRegex);
      if (fields) {
        const [_, map, mode, version, faction1, unit1, faction2, unit2] = fields;
        this.verbose(2, 'Marking', map, mode, faction1, 'vs', faction2, 'played');
        this.playedMaps.push(map);
        this.playedMaps = this.playedMaps.slice(-this.options.map_repeat_threshold);
        this.playedFactions.push(faction1);
        this.playedFactions.push(faction2);
        this.playedFactions = this.playedFactions.slice(-this.options.faction_repeat_threshold);
        this.playedInvasion.push(mode == 'Invasion');
        this.playedInvasion = this.playedInvasion.slice(-this.options.invasion_repeat_threshold);
      }
      else
        this.verbose(1, '*** error: Regex did not match line:', currLine);
    }
    catch (error) {
      this.verbose(1, '*** error:', error);
    }
  }

  setNextLayer() {
    try {
      // "Mutaha_Invasion_v1 ADF+Mechanized INS+LightInfantry"
      const nextMapRegex = /(\w+)_(\w+)_(\w+) (\w+)\+?(\w+)? (\w+)\+?(\w+)?/;
      const layersList = this.layers.slice();
      let line = '';

      this.verbose(2, 'History:', this.playedMaps, this.playedFactions, this.playedInvasion);

      while (layersList.length) {
        const lineNum = Math.floor(Math.random() * layersList.length);
        line = this.layers[lineNum];
        const parts = line.split(' ');
        if (parts.length > 3) {
          this.verbose(1, `*** error: Format error in line ${lineNum}: ${line}`);
          continue;
        }

        const fields = line.match(nextMapRegex);
        if (!fields) {
          this.verbose(1, '*** error: Regex did not match line:', line);
          continue;
        }
        const [_, map, mode, version, faction1, unit1, faction2, unit2] = fields;

        this.verbose(2, 'Trying', map, mode, version, faction1, faction2);
        if (this.playedMaps.includes(map) ||
            this.playedFactions.includes(faction1) ||
            this.playedFactions.includes(faction2) ||
            (mode == 'Invasion' && this.playedInvasion.includes(true))) {
          layersList.splice(lineNum, 1);
          continue;
        }
        break;
      }
      if (!layersList.length) {
        this.verbose(1, '*** error: No acceptable layer found. Not setting next.');
      }
      else {
        this.verbose(1, 'Setting', line);
        this.server.rcon.execute(`AdminSetNextLayer ${line}`);
        return line;
      }
      return undefined;
    }
    catch (error) {
      this.verbose(1, '*** error:', error);
    }
  }

  async onChatCommand(info) {
    try {
      if (info.chat !== 'ChatAdmin')
        return;
      const next = await this.setNextLayer();
      if (next)
        this.server.rcon.warn(info.player.eosID, 'New next layer: ' + next);
      else
        this.server.rcon.warn(info.player.eosID, 'No suitable layer found. No change.');
    }
    catch (error) {
      this.verbose(1, '*** error:', error);
    }
  }
};
