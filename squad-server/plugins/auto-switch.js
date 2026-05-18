import Sequelize from 'sequelize';
import BasePlugin from './base-plugin.js';

const { DataTypes } = Sequelize;

export default class AutoSwitch extends BasePlugin {
  static get description() {
    return (
      "The <code>AutoSwitch</code> plugin switches players to their friends' team when joining."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to persist player prefixes across restarts.',
        default: 'sqlite'
      },
      max_team_size: {
        required: false,
        description: 'The maximum size of the destination team.',
        default: 55
      },
      opt_out: {
        required: false,
        description: 'List of opt-out player prefixes.',
        default: [],
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onPlayerPrefix = this.onPlayerPrefix.bind(this);
    this.opt_outs = [];
    for (const s of this.options.opt_out) {
      this.opt_outs.push(s.replace(/\W/g, '').toLowerCase());
    }
    this.prefixCache = new Map();

    this.model = this.options.database.define(
      'AutoSwitchPlayerPrefix',
      {
        eosID: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        prefix: {
          type: DataTypes.STRING,
          allowNull: false
        }
      },
      { timestamps: false }
    );
  }

  async prepareToMount() {
    await this.model.sync();
    const rows = await this.model.findAll();
    for (const row of rows) {
      this.prefixCache.set(row.eosID, row.prefix);
    }
    this.verbose(1, `Loaded ${this.prefixCache.size} player prefixes from DB.`);
  }

  async mount() {
    this.server.on('PLAYER_PREFIX', this.onPlayerPrefix);
  }

  async unmount() {
    this.server.removeEventListener(`PLAYER_PREFIX`, this.onPlayerPrefix);
  }

  async onPlayerPrefix(info) {
    // snapshot data that could change during await
    const prefix = info.player.prefix.replace(/\W/g, '').toLowerCase();
    const eosID = info.player.eosID;
    const teamID = info.player.teamID;

    if (!prefix.length)
      return;
    this.verbose(2, `prefix:${info.player.prefix} suffix:${info.player.suffix}`);
    if (this.opt_outs.includes(prefix)) {
      this.verbose(1, "Prefix", info.player.prefix, "is opt-out.");
      return;
    }

    // Persist prefix if new or changed
    if (this.prefixCache.get(eosID) !== prefix) {
      this.prefixCache.set(eosID, prefix);
      try {
        await this.model.upsert({ eosID, prefix });
        this.verbose(2, `Persisted prefix for ${info.player.name}: ${prefix}`);
      } catch (error) {
        this.verbose(1, '*** error persisting prefix:', error);
      }
    }

    // count friends on each team
    // use prefixCache as fallback for players whose PLAYER_PREFIX hasn't fired yet this session
    const friends = [0, 0, 0];
    const players = [0, 0, 0];
    for (const player of this.server.players) {
      if (!player.teamID)
        continue;
      const playerPrefix = player.prefix
        ? player.prefix.replace(/\W/g, '').toLowerCase()
        : (this.prefixCache.get(player.eosID) || '');
      if (playerPrefix === prefix && player.eosID !== info.player.eosID)
        friends[player.teamID]++;
      players[player.teamID]++;
    }
    this.verbose(2, prefix, "friends on each team:", friends[1], friends[2]);

    if (friends[1] === friends[2])
      // equal numbers of friends on both sides: don't move
      return;

    const friendTeam = (friends[1] > friends[2]) ? 1 : 2;
    if (teamID !== friendTeam) {
      // there are more friends in the other team: switch
      if (players[friendTeam] > this.options.max_team_size) {
        this.verbose(1, `Friend team is already ${players[friendTeam]}, can't switch.`);
      }
      else {
        this.server.rcon.switchTeam(info.player.eosID);
        this.verbose(1, `Switched ${info.player.name}`);
      }
    }
    else {
      this.verbose(2, 'Already on friend team');
    }
  }
}
