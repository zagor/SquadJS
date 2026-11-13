import DiscordBasePlugin from './discord-base-plugin.js';

const SOLDIER_PAWN_REGEX = /^BP_Soldier_/i;
const STATIC_DEPLOYABLE_PAWN_REGEX =
  /^SQDeployable|_Deployable|Emplaced|_Tripod|Bunker|Baseplate|^BP_FOBRadio|_Hab|AdminCam|^CameraMan|FlyingDrone|UAV/i;

const formatInt = (val) => Math.round(val).toLocaleString('en-US');

function truncateEmbedText(text, maxLength = 1024) {
  const str = String(text || '\u200b');
  if (str.length <= maxLength) return str;
  const cut = str.lastIndexOf('\n', maxLength - 1);
  if (cut > 0) return `${str.slice(0, cut)}\n…`;
  return `${str.slice(0, maxLength - 1)}…`;
}

const INDIVIDUAL_AWARD_DEFS = [
  {
    key: 'kills',
    title: 'Most Kills',
    getValue: (p) => p.kills,
    qualifies: (p) => p.kills >= 1,
    format: (v) => `${v} kills`,
    compactFormat: (v) => `${v}`
  },
  {
    key: 'downs',
    title: 'Most Downs',
    getValue: (p) => p.downs,
    qualifies: (p) => p.downs >= 1,
    format: (v) => `${v} downs`,
    compactFormat: (v) => `${v}`
  },
  {
    key: 'maxKillStreak',
    title: 'Longest Kill Streak',
    getValue: (p) => p.maxKillStreak,
    qualifies: (p) => p.maxKillStreak >= 3,
    format: (v) => `${v} kill streak`,
    compactFormat: (v) => `${v}`
  },
  {
    key: 'kdRatio',
    title: 'Best K/D Ratio',
    getValue: (p) => p.kills / Math.max(1, p.deaths),
    qualifies: (p, opts) => p.kills >= (Number(opts.minKillsForKD) || 5),
    format: (v, p) => `${v.toFixed(2)} (${p.kills}K/${p.deaths}D)`,
    compactFormat: (v, p) => `${v.toFixed(2)} · ${p.kills}/${p.deaths}`
  },
  {
    key: 'revives',
    title: 'Most Revives',
    getValue: (p) => p.revives,
    qualifies: (p) => p.revives >= 1,
    format: (v) => `${v} revives`,
    compactFormat: (v) => `${v}`
  },
  {
    key: 'playerDamage',
    title: 'Most Damage to Players',
    getValue: (p) => p.playerDamage,
    qualifies: (p) => p.playerDamage >= 100,
    format: (v) => `${formatInt(v)} dmg`,
    compactFormat: (v) => formatInt(v)
  },
  {
    key: 'vehicleDamage',
    title: 'Most Damage to Vehicles',
    getValue: (p) => p.vehicleDamage,
    qualifies: (p) => p.vehicleDamage >= 100,
    format: (v) => `${formatInt(v)} dmg`,
    compactFormat: (v) => formatInt(v)
  },
  {
    key: 'damageByVehicle',
    title: 'Most Damage by Vehicle',
    getValue: (p) => p.damageByVehicle,
    qualifies: (p) => p.damageByVehicle >= 100,
    format: (v) => `${formatInt(v)} dmg`,
    compactFormat: (v) => formatInt(v)
  },
  {
    key: 'emplacementDamage',
    title: 'Most Damage to Emplacements',
    getValue: (p) => p.emplacementDamage,
    qualifies: (p) => p.emplacementDamage >= 50,
    format: (v) => `${formatInt(v)} dmg`,
    compactFormat: (v) => formatInt(v)
  }
];

const SHAME_AWARD_DEFS = [
  {
    key: 'deaths',
    title: 'Most Deaths',
    getValue: (p) => p.deaths,
    qualifies: (p) => p.deaths >= 1,
    format: (v) => `${v} deaths`
  },
  {
    key: 'teamkills',
    title: 'Most Teamkills',
    getValue: (p) => p.teamkills,
    qualifies: (p) => p.teamkills >= 1,
    format: (v) => `${v} TKs`
  }
];

const SQUAD_AWARD_DEFS = [
  {
    key: 'kills',
    title: 'Most Kills',
    getValue: (s) => s.kills,
    qualifies: (s) => s.kills >= 3,
    format: (v) => `${v} kills`
  },
  {
    key: 'downs',
    title: 'Most Downs',
    getValue: (s) => s.downs,
    qualifies: (s) => s.downs >= 5,
    format: (v) => `${v} downs`
  },
  {
    key: 'kdRatio',
    title: 'Best K/D Ratio',
    getValue: (s) => s.kills / Math.max(1, s.deaths),
    qualifies: (s, opts) => s.kills >= (Number(opts.minKillsForKD) || 5),
    format: (v, s) => `${v.toFixed(2)} (${s.kills}K/${s.deaths}D)`
  },
  {
    key: 'maxKillStreak',
    title: 'Longest Kill Streak',
    getValue: (s) => s.maxKillStreak,
    qualifies: (s) => s.maxKillStreak >= 3,
    format: (v) => `${v} kill streak`
  },
  {
    key: 'revives',
    title: 'Most Revives',
    getValue: (s) => s.revives,
    qualifies: (s) => s.revives >= 3,
    format: (v) => `${v} revives`
  },
  {
    key: 'playerDamage',
    title: 'Most Damage to Players',
    getValue: (s) => s.playerDamage,
    qualifies: (s) => s.playerDamage >= 500,
    format: (v) => `${formatInt(v)} dmg`
  },
  {
    key: 'vehicleDamage',
    title: 'Most Damage to Vehicles',
    getValue: (s) => s.vehicleDamage,
    qualifies: (s) => s.vehicleDamage >= 300,
    format: (v) => `${formatInt(v)} dmg`
  },
  {
    key: 'damageByVehicle',
    title: 'Most Damage by Vehicle',
    getValue: (s) => s.damageByVehicle,
    qualifies: (s) => s.damageByVehicle >= 300,
    format: (v) => `${formatInt(v)} dmg`
  },
  {
    key: 'emplacementDamage',
    title: 'Most Damage to Emplacements',
    getValue: (s) => s.emplacementDamage,
    qualifies: (s) => s.emplacementDamage >= 200,
    format: (v) => `${formatInt(v)} dmg`
  }
];

export default class RoundScore extends DiscordBasePlugin {
  static get description() {
    return (
      'The <code>RoundScore</code> plugin collects kills, downs, deaths, revives, and damage to players, ' +
      'vehicles, and emplacements during a round, posting a multi-column embed summary to Discord and sending earned ' +
      'in-game highlight popups at round end.'
    );
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: false,
        description:
          'The ID of the Discord channel to post round score summaries to (leave empty to disable Discord posting).',
        default: '',
      },
      color: {
        required: false,
        description: 'The color of the Discord embed.',
        default: 0xffc40b,
      },
      enableInGameWarns: {
        required: false,
        description:
          'Send earned round-end highlight popups (rcon.warn) to award-winning players and squads.',
        default: true
      },
      topPlayersCount: {
        required: false,
        description:
          'Number of top players per category to celebrate in Discord and in-game warns.',
        default: 3
      },
      minKillsForKD: {
        required: false,
        description: 'Minimum confirmed kills required to qualify for Best K/D Ratio.',
        default: 5
      },
      squadAwardsPerTeam: {
        required: false,
        description: 'Award best squad categories per team so both teams get celebrated.',
        default: true
      }
    };
  }

  static isMobileVehiclePawn(classname) {
    if (!classname || typeof classname !== 'string') return false;
    if (classname === 'N/A' || classname === 'nullptr') return false;
    if (SOLDIER_PAWN_REGEX.test(classname)) return false;
    return !STATIC_DEPLOYABLE_PAWN_REGEX.test(classname);
  }

  static effectiveStructuralDamage(damage, healthRemaining) {
    if (damage <= 0) return 0;
    if (typeof healthRemaining === 'number' && healthRemaining < 0) {
      const preHitHP = damage + healthRemaining;
      return Math.max(preHitHP, 0);
    }
    return damage;
  }

  static escapeMarkdown(text) {
    return String(text ?? '').replace(/([\\[\]*_~`|])/g, String.raw`\$1`);
  }

  static splitMarkdownMessage(text, maxLength = 2000) {
    if (!text) return [];
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLength) {
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxLength);
      if (splitAt <= 0) {
        chunks.push(remaining.slice(0, maxLength));
        remaining = remaining.slice(maxLength);
      } else {
        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt + 1);
      }
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnd = this.onRoundEnd.bind(this);
    this.onPlayerPossess = this.onPlayerPossess.bind(this);
    this.onPlayerUnpossess = this.onPlayerUnpossess.bind(this);
    this.onPlayerDamaged = this.onPlayerDamaged.bind(this);
    this.onPlayerWounded = this.onPlayerWounded.bind(this);
    this.onPlayerDied = this.onPlayerDied.bind(this);
    this.onPlayerRevived = this.onPlayerRevived.bind(this);
    this.onVehicleDamaged = this.onVehicleDamaged.bind(this);
    this.onDeployableTakeDamage = this.onDeployableTakeDamage.bind(this);
    this.onSquadCreated = this.onSquadCreated.bind(this);
    this.onSquadRenamed = this.onSquadRenamed.bind(this);
    this.onUpdatedSquadInformation = this.onUpdatedSquadInformation.bind(this);

    this.resetRoundStats();
  }

  async prepareToMount() {
    if (!this.options.channelID || !this.options.discordClient) {
      this.channel = null;
      return;
    }
    await super.prepareToMount();
  }

  async mount() {
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('ROUND_ENDED', this.onRoundEnd);
    this.server.on('PLAYER_POSSESS', this.onPlayerPossess);
    this.server.on('PLAYER_UNPOSSESS', this.onPlayerUnpossess);
    this.server.on('PLAYER_DAMAGED', this.onPlayerDamaged);
    this.server.on('PLAYER_WOUNDED', this.onPlayerWounded);
    this.server.on('PLAYER_DIED', this.onPlayerDied);
    this.server.on('PLAYER_REVIVED', this.onPlayerRevived);
    this.server.on('VEHICLE_DAMAGED', this.onVehicleDamaged);
    this.server.on('DEPLOYABLE_TAKE_DAMAGE', this.onDeployableTakeDamage);
    this.server.on('SQUAD_CREATED', this.onSquadCreated);
    this.server.on('SQUAD_RENAMED', this.onSquadRenamed);
    this.server.on('UPDATED_SQUAD_INFORMATION', this.onUpdatedSquadInformation);
  }

  async unmount() {
    this.server.removeListener('NEW_GAME', this.onNewGame);
    this.server.removeListener('ROUND_ENDED', this.onRoundEnd);
    this.server.removeListener('PLAYER_POSSESS', this.onPlayerPossess);
    this.server.removeListener('PLAYER_UNPOSSESS', this.onPlayerUnpossess);
    this.server.removeListener('PLAYER_DAMAGED', this.onPlayerDamaged);
    this.server.removeListener('PLAYER_WOUNDED', this.onPlayerWounded);
    this.server.removeListener('PLAYER_DIED', this.onPlayerDied);
    this.server.removeListener('PLAYER_REVIVED', this.onPlayerRevived);
    this.server.removeListener('VEHICLE_DAMAGED', this.onVehicleDamaged);
    this.server.removeListener('DEPLOYABLE_TAKE_DAMAGE', this.onDeployableTakeDamage);
    this.server.removeListener('SQUAD_CREATED', this.onSquadCreated);
    this.server.removeListener('SQUAD_RENAMED', this.onSquadRenamed);
    this.server.removeListener('UPDATED_SQUAD_INFORMATION', this.onUpdatedSquadInformation);
  }

  resetRoundStats(startTime = new Date()) {
    this.roundStartTime = startTime instanceof Date ? startTime : new Date();
    this.playerStats = new Map();
    this.squadStats = new Map();
    this.activeVehicleByEOSID = new Map();
  }

  ensurePlayerStat(player) {
    if (!player?.eosID) return null;
    let stat = this.playerStats.get(player.eosID);
    if (!stat) {
      stat = {
        eosID: player.eosID,
        name: player.name || 'Unknown',
        teamID: player.teamID ?? null,
        squadID: player.squadID ?? null,
        kills: 0,
        downs: 0,
        deaths: 0,
        revives: 0,
        teamkills: 0,
        currentKillStreak: 0,
        maxKillStreak: 0,
        currentDownStreak: 0,
        maxDownStreak: 0,
        playerDamage: 0,
        vehicleDamage: 0,
        emplacementDamage: 0,
        damageByVehicle: 0
      };
      this.playerStats.set(player.eosID, stat);
    } else {
      if (player.name) stat.name = player.name;
      if (player.teamID != null) stat.teamID = player.teamID;
      if (player.squadID !== undefined) stat.squadID = player.squadID;
    }
    return stat;
  }

  ensureSquadStat(teamID, squadID, squadNameFallback = null, teamNameFallback = null) {
    if (teamID == null || squadID == null) return null;
    const numericTeamID = Number(teamID);
    const numericSquadID = Number(squadID);
    if (!Number.isFinite(numericTeamID) || !Number.isFinite(numericSquadID)) return null;

    const key = `${numericTeamID}:${numericSquadID}`;
    const liveSquad = Array.isArray(this.server.squads)
      ? this.server.squads.find(
          (s) => Number(s.teamID) === numericTeamID && Number(s.squadID) === numericSquadID
        )
      : null;

    let stat = this.squadStats.get(key);
    if (!stat) {
      stat = {
        key,
        teamID: numericTeamID,
        squadID: numericSquadID,
        squadName: liveSquad?.squadName || squadNameFallback || `Squad ${numericSquadID}`,
        teamName: liveSquad?.teamName || teamNameFallback || `Team ${numericTeamID}`,
        kills: 0,
        downs: 0,
        deaths: 0,
        revives: 0,
        teamkills: 0,
        currentKillStreak: 0,
        maxKillStreak: 0,
        playerDamage: 0,
        vehicleDamage: 0,
        emplacementDamage: 0,
        damageByVehicle: 0,
        contributors: new Set()
      };
      this.squadStats.set(key, stat);
    } else {
      if (liveSquad?.squadName) stat.squadName = liveSquad.squadName;
      else if (squadNameFallback) stat.squadName = squadNameFallback;
      if (liveSquad?.teamName) stat.teamName = liveSquad.teamName;
      else if (teamNameFallback) stat.teamName = teamNameFallback;
    }
    return stat;
  }

  addPositiveSquadMetric(player, field, amount) {
    if (player?.teamID == null || player?.squadID == null || amount <= 0) return;
    const sq = this.ensureSquadStat(player.teamID, player.squadID);
    if (!sq) return;
    sq[field] += amount;
    sq.contributors.add(player.eosID);
    this.verbose(2, `Added ${amount} to squad ${sq.squadName} (${sq.key}) ${field} from player ${player.name}.`);
  }

  isPlayerInVehicle(player) {
    if (!player?.eosID) return false;
    if (this.activeVehicleByEOSID.has(player.eosID)) {
      return Boolean(this.activeVehicleByEOSID.get(player.eosID)?.pawn);
    }
    return RoundScore.isMobileVehiclePawn(player.vehicle) ||
      RoundScore.isMobileVehiclePawn(player.possessClassname);
  }

  onNewGame(data) {
    this.resetRoundStats(data?.time || new Date());
  }

  onPlayerPossess(data) {
    const eosID = data?.player?.eosID || data?.playerEOSID;
    if (!eosID) return;
    if (data.player) this.ensurePlayerStat(data.player);

    const pawn = RoundScore.isMobileVehiclePawn(data.possessClassname)
      ? data.possessClassname
      : null;
    this.activeVehicleByEOSID.set(eosID, {
      pawn,
      chainID: data.chainID ?? null
    });
  }

  onPlayerUnpossess(data) {
    const eosID = data?.player?.eosID || data?.playerEOSID;
    if (!eosID || data.switchPossess) return;

    const current = this.activeVehicleByEOSID.get(eosID);
    if (current) {
      if (data.chainID != null && current.chainID === data.chainID) return;
      if (data.possessClassname && current.pawn && data.possessClassname !== current.pawn) return;
    }

    this.activeVehicleByEOSID.set(eosID, {
      pawn: null,
      chainID: data.chainID ?? null
    });
  }

  onPlayerDamaged(data) {
    const { attacker, victim, damage, weapon } = data;
    if (!attacker || damage <= 0) return;
    if (victim && attacker.eosID === victim.eosID) return;
    if (data.teamkill) return;
    if (victim && victim.teamID === attacker.teamID) return;

    const rawPawn =
      this.activeVehicleByEOSID.get(attacker.eosID)?.pawn ||
      attacker.possessClassname ||
      attacker.vehicle ||
      null;
    const normalizedPawn = rawPawn ? rawPawn.replace(/_C$/, '') : null;
    if (!victim && normalizedPawn && weapon?.replace(/_C$/, '').startsWith(normalizedPawn))
      return;

    const stat = this.ensurePlayerStat(attacker);
    stat.playerDamage += damage;
    this.addPositiveSquadMetric(attacker, 'playerDamage', damage);

    if (this.isPlayerInVehicle(attacker)) {
      stat.damageByVehicle += damage;
      this.addPositiveSquadMetric(attacker, 'damageByVehicle', damage);
    }
  }

  onPlayerWounded(data) {
    const { attacker, victim } = data;
    if (victim) this.ensurePlayerStat(victim);
    if (!attacker) return;
    if (victim && attacker.eosID === victim.eosID) return;

    const attackerStat = this.ensurePlayerStat(attacker);
    const isTK = Boolean(data.teamkill || (victim && victim.teamID === attacker.teamID));
    if (isTK) {
      attackerStat.teamkills += 1;
      const sq = this.ensureSquadStat(attacker.teamID, attacker.squadID);
      if (sq) sq.teamkills += 1;
      return;
    }

    attackerStat.downs += 1;
    attackerStat.currentDownStreak += 1;
    if (attackerStat.currentDownStreak > attackerStat.maxDownStreak) {
      attackerStat.maxDownStreak = attackerStat.currentDownStreak;
    }
    this.addPositiveSquadMetric(attacker, 'downs', 1);
  }

  onPlayerDied(data) {
    const { attacker, victim } = data;
    if (victim) {
      const victimStat = this.ensurePlayerStat(victim);
      victimStat.deaths += 1;
      victimStat.currentKillStreak = 0;
      victimStat.currentDownStreak = 0;
      this.activeVehicleByEOSID.set(victim.eosID, { pawn: null, chainID: data.chainID ?? null });

      const victimSq = this.ensureSquadStat(victim.teamID, victim.squadID);
      if (victimSq) {
        victimSq.deaths += 1;
        victimSq.currentKillStreak = 0;
      }
    }

    if (!attacker) return;
    if (victim && attacker.eosID === victim.eosID) return;
    if (data.teamkill || (victim && victim.teamID === attacker.teamID)) return;

    const attackerStat = this.ensurePlayerStat(attacker);
    attackerStat.kills += 1;
    attackerStat.currentKillStreak += 1;
    if (attackerStat.currentKillStreak > attackerStat.maxKillStreak) {
      attackerStat.maxKillStreak = attackerStat.currentKillStreak;
    }
    this.addPositiveSquadMetric(attacker, 'kills', 1);

    const attackerSq = this.ensureSquadStat(attacker.teamID, attacker.squadID);
    if (attackerSq) {
      attackerSq.currentKillStreak += 1;
      if (attackerSq.currentKillStreak > attackerSq.maxKillStreak) {
        attackerSq.maxKillStreak = attackerSq.currentKillStreak;
      }
    }
  }

  onPlayerRevived(data) {
    const { reviver, victim } = data;
    if (!reviver) return;
    if (victim && reviver.eosID === victim.eosID) return;

    const reviverStat = this.ensurePlayerStat(reviver);
    reviverStat.revives += 1;
    this.addPositiveSquadMetric(reviver, 'revives', 1);
  }

  onVehicleDamaged(data) {
    const { attacker, victim, victimVehicle, damage, healthRemaining } = data;
    if (!attacker) return;
    if (data.teamkill) return;
    if (victim && victim.eosID === attacker.eosID) return;
    if (victim && victim.teamID === attacker.teamID) return;
    if (victimVehicle && (victimVehicle === attacker.name || victimVehicle === attacker.suffix)) {
      return;
    }

    const effective = RoundScore.effectiveStructuralDamage(damage, healthRemaining);
    if (effective <= 0) return;

    const stat = this.ensurePlayerStat(attacker);
    stat.vehicleDamage += effective;
    this.addPositiveSquadMetric(attacker, 'vehicleDamage', effective);

    if (this.isPlayerInVehicle(attacker)) {
      stat.damageByVehicle += effective;
      this.addPositiveSquadMetric(attacker, 'damageByVehicle', effective);
    }
  }

  onDeployableTakeDamage(data) {
    const { attacker, damage, healthRemaining } = data;
    if (!attacker) return;

    const effective = RoundScore.effectiveStructuralDamage(damage, healthRemaining);
    if (effective <= 0) return;

    const stat = this.ensurePlayerStat(attacker);
    stat.emplacementDamage += effective;
    this.addPositiveSquadMetric(attacker, 'emplacementDamage', effective);

    if (this.isPlayerInVehicle(attacker)) {
      stat.damageByVehicle += effective;
      this.addPositiveSquadMetric(attacker, 'damageByVehicle', effective);
    }
  }

  onSquadCreated(data) {
    if (!data?.player) return;
    this.ensureSquadStat(data.player.teamID, data.squadID, data.squadName, data.teamName);
  }

  onSquadRenamed(data) {
    if (!data) return;
    const sq = this.ensureSquadStat(data.teamID, data.squadID, data.newName);
    if (sq && data.newName) sq.squadName = data.newName;
  }

  onUpdatedSquadInformation() {
    if (!Array.isArray(this.server.squads)) return;
    for (const liveSquad of this.server.squads) {
      const key = `${Number(liveSquad.teamID)}:${Number(liveSquad.squadID)}`;
      const existing = this.squadStats.get(key);
      if (existing) {
        if (liveSquad.squadName) existing.squadName = liveSquad.squadName;
        if (liveSquad.teamName) existing.teamName = liveSquad.teamName;
      }
    }
  }

  computeAwards() {
    this.onUpdatedSquadInformation();

    const makeBucket = () => ({
      kills: 0,
      downs: 0,
      deaths: 0,
      revives: 0,
      teamkills: 0,
      playerDamage: 0,
      vehicleDamage: 0,
      emplacementDamage: 0,
      damageByVehicle: 0
    });

    const totals = {
      overall: makeBucket(),
      teams: { 1: makeBucket(), 2: makeBucket() }
    };

    const players = Array.from(this.playerStats.values());
    for (const p of players) {
      const buckets = [totals.overall];
      if (p.teamID === 1 || p.teamID === 2) buckets.push(totals.teams[p.teamID]);
      for (const b of buckets) {
        b.kills += p.kills;
        b.downs += p.downs;
        b.deaths += p.deaths;
        b.revives += p.revives;
        b.teamkills += p.teamkills;
        b.playerDamage += p.playerDamage;
        b.vehicleDamage += p.vehicleDamage;
        b.emplacementDamage += p.emplacementDamage;
        b.damageByVehicle += p.damageByVehicle;
      }
    }

    const topCount = Math.max(1, Number(this.options.topPlayersCount) || 3);
    const rankPlayers = (def) =>
      players
        .filter((p) => def.qualifies(p, this.options))
        .map((p) => {
          const value = def.getValue(p);
          return {
            ...p,
            value,
            formatted: def.format(value, p),
            compactFormatted: def.compactFormat ? def.compactFormat(value, p) : def.format(value, p)
          };
        })
        .sort(
          (a, b) =>
            b.value - a.value ||
            b.kills - a.kills ||
            b.downs - a.downs ||
            b.playerDamage - a.playerDamage
        )
        .slice(0, topCount);

    const individualAwards = INDIVIDUAL_AWARD_DEFS.map((def) => ({
      key: def.key,
      title: def.title,
      winners: rankPlayers(def)
    }));

    const shameAwards = SHAME_AWARD_DEFS.map((def) => ({
      key: def.key,
      title: def.title,
      winners: rankPlayers(def)
    })).filter((award) => award.winners.length > 0);

    const squads = Array.from(this.squadStats.values());
    const squadAwards = [];
    const teamScopes = this.options.squadAwardsPerTeam ? [1, 2] : [null];

    for (const teamScope of teamScopes) {
      const scopedSquads =
        teamScope == null ? squads : squads.filter((s) => s.teamID === teamScope);
      for (const def of SQUAD_AWARD_DEFS) {
        const candidates = scopedSquads
          .filter((s) => def.qualifies(s, this.options))
          .map((s) => {
            const value = def.getValue(s);
            return {
              ...s,
              value,
              formatted: def.format(value, s)
            };
          })
          .sort(
            (a, b) =>
              b.value - a.value ||
              b.kills - a.kills ||
              b.downs - a.downs ||
              b.playerDamage - a.playerDamage
          );

        if (candidates.length > 0) {
          squadAwards.push({
            key: def.key,
            title: def.title,
            teamID: teamScope,
            winner: candidates[0]
          });
        }
      }
    }

    return { totals, individualAwards, shameAwards, squadAwards };
  }

  formatDuration(endTime) {
    const endMs = endTime instanceof Date ? endTime.getTime() : Date.now();
    const startMs = this.roundStartTime instanceof Date ? this.roundStartTime.getTime() : endMs;
    const totalSec = Math.max(0, Math.round((endMs - startMs) / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
  }

  formatDiscordEmbed(info = {}, awards = this.computeAwards()) {
    const esc = RoundScore.escapeMarkdown;
    const layerLabel =
      info?.winner?.layer ||
      this.server.currentLayer?.name ||
      this.server.currentLayer?.layerid ||
      'Unknown Layer';

    const duration = this.formatDuration(info?.time);
    const fields = [];
    let description;

    if (info?.winner && info?.loser) {
      description = `**Duration:** ${duration}`;
      const winTickets = Number(info.winner.tickets) || 0;
      const loseTickets = Number(info.loser.tickets) || 0;
      const winLabel = [info.winner.faction, info.winner.subfaction].filter(Boolean).join(' - ');
      const loseLabel = [info.loser.faction, info.loser.subfaction].filter(Boolean).join(' - ');

      fields.push(
        {
          name: 'Winner',
          value: truncateEmbedText(
            [
              `**Team ${esc(info.winner.team)}** — **${winTickets}** tickets`,
              winLabel ? esc(winLabel) : null
            ]
              .filter(Boolean)
              .join('\n')
          ),
          inline: true
        },
        {
          name: 'Loser',
          value: truncateEmbedText(
            [
              `**Team ${esc(info.loser.team)}** — **${loseTickets}** tickets`,
              loseLabel ? esc(loseLabel) : null
            ]
              .filter(Boolean)
              .join('\n')
          ),
          inline: true
        }
      );
    } else {
      description = `Match ended in a **Draw** · **Duration:** ${duration}`;
    }

    const { totals, individualAwards, shameAwards, squadAwards } = awards;
    const formatBucketColumn = (b) =>
      [
        `**${b.kills}** kills`,
        `**${b.downs}** downs`,
        `**${b.revives}** revives`,
        `**${formatInt(b.playerDamage)}** player dmg`,
        `**${formatInt(b.vehicleDamage)}** vehicle dmg`,
        `**${formatInt(b.emplacementDamage)}** emplacement dmg`
      ].join('\n');

    fields.push(
      { name: '── Match Totals ──', value: '\u200b', inline: false },
      { name: 'Overall', value: formatBucketColumn(totals.overall), inline: true },
      { name: 'Team 1', value: formatBucketColumn(totals.teams[1]), inline: true },
      { name: 'Team 2', value: formatBucketColumn(totals.teams[2]), inline: true }
    );

    const populatedIndividual = individualAwards.filter((a) => a.winners.length > 0);
    if (populatedIndividual.length > 0) {
      fields.push({ name: '── Top Performers ──', value: '\u200b', inline: false });
      for (const award of populatedIndividual) {
        const ranks = award.winners
          .map((w, idx) => `${idx + 1}. **${esc(w.name)}** (${w.compactFormatted || w.formatted})`)
          .join('\n');
        fields.push({
          name: truncateEmbedText(award.title, 256),
          value: truncateEmbedText(ranks, 1024),
          inline: true
        });
      }
    }

    if (squadAwards.length > 0) {
      fields.push({ name: '── Top Squads ──', value: '\u200b', inline: false });
      for (const teamID of [1, 2]) {
        const teamAwards = squadAwards.filter((a) => (a.teamID ?? a.winner.teamID) === teamID);
        if (teamAwards.length === 0) continue;
        const header = `Team ${teamID}`;
        const body = teamAwards
          .map((a) => {
            const w = a.winner;
            return `**${a.title}:** Sq ${w.squadID} "${esc(w.squadName)}" (${w.formatted})`;
          })
          .join('\n');
        fields.push({
          name: truncateEmbedText(header, 256),
          value: truncateEmbedText(body, 1024),
          inline: true
        });
      }
    }

    if (shameAwards.length > 0) {
      fields.push({ name: '── Rough Round ──', value: '\u200b', inline: false });
      for (const award of shameAwards) {
        const ranks = award.winners
          .map((w, idx) => `${idx + 1}. **${esc(w.name)}** (${w.formatted})`)
          .join('\n');
        fields.push({
          name: truncateEmbedText(award.title, 256),
          value: truncateEmbedText(ranks, 1024),
          inline: true
        });
      }
    }

    return {
      title: truncateEmbedText(`Round Summary — ${esc(layerLabel)}`, 256),
      description,
      color: this.options.color,
      fields,
      timestamp: (info?.time instanceof Date ? info.time : new Date()).toISOString()
    };
  }

  buildPlayerWarnMessages(awards) {
    const onlinePlayers = Array.isArray(this.server.players) ? this.server.players : [];
    const onlineByEOS = new Map();
    for (const p of onlinePlayers) {
      if (p?.eosID) onlineByEOS.set(p.eosID, p);
    }

    const linesByEOS = new Map();
    const pushLine = (eosID, line) => {
      if (!onlineByEOS.has(eosID)) return;
      let list = linesByEOS.get(eosID);
      if (!list) {
        list = [];
        linesByEOS.set(eosID, list);
      }
      if (!list.includes(line)) list.push(line);
    };

    for (const award of awards.individualAwards) {
      award.winners.forEach((winner, idx) => {
        pushLine(winner.eosID, `#${idx + 1} ${award.title} (${winner.formatted})`);
      });
    }

    for (const award of awards.squadAwards) {
      const sq = award.winner;
      const prefix = award.teamID ? 'Team ' : '';
      const line = `Sq ${sq.squadID} "${sq.squadName}": ${prefix}${award.title} (${sq.formatted})`;
      for (const player of onlinePlayers) {
        if (!player?.eosID) continue;
        if (
          Number(player.teamID) === sq.teamID &&
          Number(player.squadID) === sq.squadID &&
          sq.contributors.has(player.eosID)
        ) {
          pushLine(player.eosID, line);
        }
      }
    }

    const messages = new Map();
    for (const [eosID, list] of linesByEOS.entries()) {
      if (list.length > 0) {
        messages.set(eosID, ['Round Highlights:', ...list].join('\n'));
      }
    }
    return messages;
  }

  async onRoundEnd(info = {}) {
    try {
      const awards = this.computeAwards();

      if (this.channel) {
        try {
          const embed = this.formatDiscordEmbed(info, awards);
          await this.sendDiscordMessage({
            embed,
            allowedMentions: { parse: [] }
          });
        } catch (err) {
          this.verbose(1, `Failed to send round score summary to Discord: ${err.message}`);
        }
      }

      if (this.options.enableInGameWarns && this.server.rcon?.warn) {
        const warnMessages = this.buildPlayerWarnMessages(awards);
        for (const [eosID, message] of warnMessages.entries()) {
          try {
            await this.server.rcon.warn(eosID, message);
          } catch (err) {
            this.verbose(1, `Failed to send round highlight warn to ${eosID}: ${err.message}`);
          }
        }
      }
    } finally {
      this.resetRoundStats(info?.time instanceof Date ? info.time : new Date());
    }
  }
}
