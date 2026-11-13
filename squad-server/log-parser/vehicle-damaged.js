import { iterateIDs, capitalID } from 'core/id-parser';

// [2026.10.03-03.58.05:739][325]LogSquadTrace: [DedicatedServer]TraceAndMessageClient(): SQVehicleSeat::TakeDamage[PointDamage] BP_Kamaz_5350_Desert_C_2139220754 for 3.000000 damage (type=BP_SmallArms_DamageType_C)
// [2026.10.03-03.58.05:739][325]LogSquadTrace: [DedicatedServer]TraceAndMessageClient(): BP_Kamaz_5350_Desert_C_2139220754: 3.00 damage taken by causer BP_AK12GP25_Rifle_Reddot_C_2139166940 instigator (Online Ids: sneakyy) EOS: 0002a7ca4d0449a59f0ece2aac1be24b steam: 76561198769911177 health remaining 122.12


export default {
  regex:
    /^\[([\d.:-]+)]\[([ \d]*)]LogSquadTrace: \[DedicatedServer](?:ASQVehicle::)?TraceAndMessageClient\(\): (?:SQVehicle(?:Seat)?::TakeDamage\[[^\]]+] ([\w-]+_C)_\d+ for \S+ damage|(.+): ([\d.]+) damage taken by causer (\S+?) instigator \(Online Ids:\s*(.+?)\)\s+(.+?) health remaining (-?[\d.]+))/,
  onMatch: (args, logParser) => {
    if (args[3]) {
      logParser.eventStore.session._lastVehicleSeatHit = {
        chainID: args[2],
        vehicleClassname: args[3]
      };
      return;
    }

    const idsStr = args[8];
    if (!idsStr || idsStr.includes('INVALID')) return;

    const damage = Number.parseFloat(args[5]);
    if (damage <= 0) return;

    const victimVehicle = args[4];
    const lastSeatHit = logParser.eventStore.session._lastVehicleSeatHit;
    let vehicleClassname = null;
    if (lastSeatHit && lastSeatHit.chainID === args[2]) {
      vehicleClassname = lastSeatHit.vehicleClassname;
    } else {
      const actorMatch = victimVehicle.match(/^([A-Za-z0-9_-]+_C)_\d+$/);
      if (actorMatch) vehicleClassname = actorMatch[1];
    }

    const data = {
      raw: args[0],
      time: args[1],
      chainID: args[2],
      victimVehicle,
      vehicleClassname,
      damage,
      weapon: args[6].replace(/^(.+_C)_\d+$/, '$1'),
      attackerName: args[7],
      healthRemaining: Number.parseFloat(args[9])
    };

    iterateIDs(idsStr).forEach((platform, id) => {
      data['attacker' + capitalID(platform)] = id;
    });

    if (!data.attackerEOSID) return;

    logParser.emit('VEHICLE_DAMAGED', data);
  }
};
