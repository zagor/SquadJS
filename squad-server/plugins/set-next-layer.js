import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import Sequelize from 'sequelize';
import BasePlugin from './base-plugin.js';

const { DataTypes } = Sequelize;

export default class SetNextLayer extends BasePlugin {
  static get description() {
    return 'Set next layer according to preferences.';
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to persist play history across restarts.',
        default: 'sqlite'
      },
      layer_rotation_cfg: {
        required: false,
        description: 'Path + filename to the LayerRotation.cfg file',
        default: 'LayerRotation.cfg'
      },
      small_layers_cfg: {
        required: false,
        description: 'Path + filename to a list of small layers (same format as LayerRotation.cfg)',
        default: 'SmallLayers.cfg'
      },
      small_layer_after_seed: {
        required: false,
        description:
          'If true, the layer set after a seed layer is picked from small_layers_cfg instead of layer_rotation_cfg',
        default: false
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
      mode_repeat_threshold: {
        required: false,
        description: 'How many other modes must be played before next Invasion or AAS is allowed?',
        default: 5
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
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onNewGame = this.onNewGame.bind(this);
    this.onChatCommand = this.onChatCommand.bind(this);
    this.layers = [];
    this.smallLayers = [];
    this.playedMaps = [];
    this.playedFactions = [];
    this.playedModes = [];

    this.model = this.options.database.define(
      'SetNextLayerState',
      {
        playedMaps: {
          type: DataTypes.TEXT,
          defaultValue: '[]'
        },
        playedFactions: {
          type: DataTypes.TEXT,
          defaultValue: '[]'
        },
        playedModes: {
          type: DataTypes.TEXT,
          defaultValue: '[]'
        }
      },
      { timestamps: false }
    );
    this.stateRow = null;
  }

  async prepareToMount() {
    await this.model.sync();
    this.stateRow = await this.model.findOne();
    if (this.stateRow) {
      this.playedMaps = JSON.parse(this.stateRow.playedMaps);
      this.playedFactions = JSON.parse(this.stateRow.playedFactions);
      this.playedModes = JSON.parse(this.stateRow.playedModes);
      this.verbose(
        1,
        `Restored history from DB: maps: [${this.playedMaps}], factions: [${this.playedFactions}], modes: [${this.playedModes}]`
      );
    } else {
      this.stateRow = await this.model.create({
        playedMaps: '[]',
        playedFactions: '[]',
        playedModes: '[]'
      });
      this.verbose(2, 'No persisted history found in DB, starting fresh.');
    }
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    await this.readLayers();
    this.markCurrentLayer();
  }

  async saveHistory() {
    try {
      await this.stateRow.update({
        playedMaps: JSON.stringify(this.playedMaps),
        playedFactions: JSON.stringify(this.playedFactions),
        playedModes: JSON.stringify(this.playedModes)
      });
      this.verbose(3, 'History saved to DB.');
    } catch (error) {
      this.verbose(1, '*** error saving history to DB:', error);
    }
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`,
                                    this.onChatCommand);
  }

  readLayers() {
    try {
      this.layers = this.readLayerFile(this.options.layer_rotation_cfg);
      if (this.options.small_layers_cfg) {
        this.smallLayers = this.readLayerFile(this.options.small_layers_cfg);
      }
    } catch (error) {
      this.verbose(1, '*** error:', error);
    }
  }

  readLayerFile(filename) {
    const fileStream = createReadStream(filename);
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
    const layers = [];
    for (const line of rl) {
      if (line.trim() === '') continue;
      layers.push(line.trim());
    }
    this.verbose(2, `Read ${layers.length} layers from ${filename}`);
    return layers;
  }

  isSeedLayer() {
    const layer = this.server.currentLayer;
    if (!layer) return false;
    return layer.name.toLowerCase().includes('seed');
  }

  getLayerCandidates() {
    if (this.options.small_layer_after_seed && this.isSeedLayer()) {
      if (this.smallLayers.length) {
        this.verbose(2, 'Current layer is a seed layer, picking from small layers list.');
        return this.smallLayers;
      }
      this.verbose(
        1,
        '*** error: small_layer_after_seed is set but no small layers loaded, using normal rotation.'
      );
    }
    return this.layers;
  }

  async onNewGame(info) {
    this.markCurrentLayer();
    this.readLayers();
    this.setNextLayer();
  }

  markCurrentLayer() {
    try {
      if (this.server.players.length < this.options.min_players) {
        this.verbose(2, 'Only', this.server.players.length, 'players, not marking this as played.');
        return;
      }

      const currRegex = /(\w+)_(\w+)_(\w+) +(\w+)_[A-Z]+_([-\w]+) +(\w+)_[A-Z]+_([-\w]+)/;
      const currLine = `${this.server.currentLayer.layerid} ${this.server.currentTeams[0].unitID} ${this.server.currentTeams[1].unitID}`;
      const fields = currLine.match(currRegex);
      if (fields) {
        const [, map, mode, , faction1, , faction2] = fields;
        if (this.playedMaps.length > 0 && this.playedMaps[-1] === map) {
          this.verbose(2, 'Current map is the same as last map, not marking as played again.');
          return;
        }
        this.verbose(2, 'Marking', map, mode, faction1, 'vs', faction2, 'played');
        this.playedMaps.push(map);
        this.playedMaps = this.playedMaps.slice(-this.options.map_repeat_threshold);
        this.playedFactions.push(faction1);
        this.playedFactions.push(faction2);
        this.playedFactions = this.playedFactions.slice(-this.options.faction_repeat_threshold);
        this.playedModes.push(mode);
        this.playedModes = this.playedModes.slice(-this.options.mode_repeat_threshold);
        this.saveHistory();
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
      const nextMapRegex = /(\w+)_(\w+)_(\w+) +(\w+)\+?(\w+)? +(\w+)\+?(\w+)?/;
      const layersList = this.getLayerCandidates().slice();
      let line = '';

      this.verbose(2, 'History:', this.playedMaps, this.playedFactions, this.playedModes);

      while (layersList.length) {
        const lineNum = Math.floor(Math.random() * layersList.length);
        line = layersList[lineNum];
        const parts = line.split(' ');
        if (parts.length > 3) {
          this.verbose(1, `*** error: Format error in line ${lineNum}: ${line}`);
          continue;
        }

        const fields = line.match(nextMapRegex);
        if (!fields) {
          this.verbose(1, '*** error: Regex did not match line:', line);
          layersList.splice(lineNum, 1);
          continue;
        }
        const [, map, mode, version, faction1, , faction2] = fields;

        this.verbose(2, 'Trying', map, mode, version, faction1, faction2);
        if (this.playedMaps.includes(map) ||
            this.playedFactions.includes(faction1) ||
            this.playedFactions.includes(faction2) ||
            (mode === 'Invasion' && this.playedModes.includes('Invasion')) ||
            (mode === 'AAS' && this.playedModes.includes('AAS'))) {
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
