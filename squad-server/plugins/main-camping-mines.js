import BasePlugin from './base-plugin.js';

// Unreal Engine world units are centimetres.
const UNITS_PER_METER = 100;

export default class MainCampingMines extends BasePlugin {
  static get description() {
    return (
      'The <code>MainCampingMines</code> plugin monitors deployed mines near the enemy main base. ' +
      'Server rules only allow blocking a single exit from the enemy main with mines, so all mines a ' +
      'team places within <code>mainRadius</code> of the enemy main must lie within <code>clusterRadius</code> ' +
      'of the first such mine. Violating mines result in a warning to the player and online admins.'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      mineClassnamePattern: {
        required: false,
        description: 'Regular expression (case-insensitive) matched against the deployable classname to detect mines.',
        default: 'Mine$'
      },
      mainRadius: {
        required: false,
        description: 'Distance (m) from the enemy main within which mine placement is monitored.',
        default: 300
      },
      clusterRadius: {
        required: false,
        description: 'Radius (m) around the first mine near an enemy main within which all further mines must be placed.',
        default: 50
      },
      warnPlayer: {
        required: false,
        description: 'Warn the player who placed the violating mine.',
        default: true
      },
      playerWarnMessage: {
        required: false,
        description:
          'Warning sent to the player. Placeholders: {distance} (m from allowed mine cluster), {mainDistance} (m from enemy main).',
        default:
          'Main camping violation!\n\nYou may only mine ONE exit from the enemy main. This mine is {distance}m from the other mined exit. Remove it!'
      },
      warnAdmins: {
        required: false,
        description: 'Warn online admins about violations.',
        default: true
      },
      adminPermission: {
        required: false,
        description: 'Admin permission required to receive violation warnings.',
        default: 'canseeadminchat'
      },
      warnCooldown: {
        required: false,
        description: 'Minimum seconds between warnings for the same player.',
        default: 15
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.mineRegex = new RegExp(this.options.mineClassnamePattern, 'i');
    this.reset();

    this.onDeployableSpawned = this.onDeployableSpawned.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
  }

  reset() {
    // Keyed by the team ID whose main is being mined -> first mine location (anchor).
    this.anchors = {};
    // Keyed by player EOS ID (or name) -> timestamp of last warning.
    this.lastWarned = {};
  }

  async mount() {
    this.server.on('DEPLOYABLE_SPAWNED', this.onDeployableSpawned);
    this.server.on('NEW_GAME', this.onNewGame);
  }

  async unmount() {
    this.server.removeListener('DEPLOYABLE_SPAWNED', this.onDeployableSpawned);
    this.server.removeListener('NEW_GAME', this.onNewGame);
  }

  onNewGame() {
    this.reset();
  }

  static distance2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  async onDeployableSpawned(data) {
    if (!this.mineRegex.test(data.deployableClassname)) return;

    const layer = this.server.currentLayer;
    if (!layer || !layer.mainBases) return;

    const loc = data.location;
    if (!loc || !Number.isFinite(loc.x) || !Number.isFinite(loc.y)) return;

    const teamID = parseInt(data.teamID);
    const enemyTeamID = teamID === 1 ? 2 : 1;
    const enemyMain = layer.mainBases[enemyTeamID];
    if (!enemyMain) {
      this.verbose(2, `*** No main base for team ${enemyTeamID} on layer ${layer.layerid}.`);
      return;
    }

    const mainDistance = MainCampingMines.distance2D(loc, enemyMain) / UNITS_PER_METER;
    if (mainDistance > this.options.mainRadius) return;

    const anchor = this.anchors[enemyTeamID];
    if (!anchor) {
      this.anchors[enemyTeamID] = { ...loc, playerName: data.playerName };
      this.verbose(
        1,
        `Team ${teamID} mined enemy main exit (${Math.round(mainDistance)}m from main) by ${data.playerName}.`
      );
      return;
    }

    const clusterDistance = MainCampingMines.distance2D(loc, anchor) / UNITS_PER_METER;
    if (clusterDistance <= this.options.clusterRadius) return;

    await this.reportViolation(data, Math.round(clusterDistance), Math.round(mainDistance));
  }

  async reportViolation(data, distance, mainDistance) {
    const player = data.player;
    const playerName = player?.name || data.playerName;
    const playerKey = player?.eosID || data.playerEOSID || playerName;

    this.verbose(
      1,
      `Violation: ${playerName} (team ${data.teamID}) placed ${data.deployableClassname} ` +
        `${mainDistance}m from enemy main, ${distance}m from mined exit.`
    );

    const now = Date.now();
    if (now - (this.lastWarned[playerKey] || 0) < this.options.warnCooldown * 1000) return;
    this.lastWarned[playerKey] = now;

    const warnID = player?.eosID || data.playerEOSID;
    if (this.options.warnPlayer && warnID) {
      const message = this.options.playerWarnMessage
        .replace(/\{distance\}/g, distance)
        .replace(/\{mainDistance\}/g, mainDistance);
      try {
        await this.server.rcon.warn(warnID, message);
      } catch (err) {
        this.verbose(1, `Failed to warn ${playerName}: ${err.message}`);
      }
    }

    if (this.options.warnAdmins) {
      const squad = player?.squadID ? `squad ${player.squadID}` : 'no squad';
      const faction = this.server.currentTeams[player.teamID - 1].faction;
      const adminMessage =
        `[Main camping]\n\n${playerName} (${faction}, ${squad}) placed a mine ` +
        `${mainDistance}m from enemy main, ${distance}m from the already mined exit.`;
      const admins = this.server.getAdminsWithPermission(this.options.adminPermission, 'eosID');
      for (const p of this.server.players) {
        if (!admins.includes(p.eosID)) continue;
        try {
          await this.server.rcon.warn(p.eosID, adminMessage);
        } catch (err) {
          this.verbose(1, `Failed to warn admin ${p.name}: ${err.message}`);
        }
      }
    }
  }
}
