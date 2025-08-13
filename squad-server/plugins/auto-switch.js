import BasePlugin from './base-plugin.js';

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
  }

  mount() {
    this.server.on('PLAYER_PREFIX', this.onPlayerPrefix);
  }

  onPlayerPrefix(info) {
    const prefix = info.player.prefix.replace(/\W/g, '').toLowerCase();
    if (!prefix.length)
      return;
    this.verbose(2, `prefix:${info.player.prefix} suffix:${info.player.suffix}`);
    if (this.opt_outs.includes(prefix)) {
      this.verbose(1, "Prefix", info.player.prefix, "is opt-out.");
      return;
    }

    // count friends on each team
    let friends = [0, 0, 0];
    let players = [0, 0, 0];
    for (const player of this.server.players) {
      if (player.prefix && player.prefix.replace(/\W/g, '').toLowerCase() == prefix
          && player.playerID != info.player.playerID)
        friends[player.teamID]++;
      players[player.teamID]++;
    }
    this.verbose(2, prefix, "friends on each team:", friends[1], friends[2]);

    if (friends[1] == friends[2])
      // equal numbers of friends on both sides: don't move
      return;

    const friendTeam = (friends[1] > friends[2]) ? 1 : 2;
    if (info.player.teamID != friendTeam) {
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
