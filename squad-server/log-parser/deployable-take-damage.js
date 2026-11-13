import { iterateIDs, capitalID } from 'core/id-parser';

const VEHICLE_WRECK_REGEX = /(?:_Destroy|_destroyed|_Obliterate)$/i;

export default {
  regex:
    /^\[([\d.:-]+)]\[([ \d]*)]LogSquadTrace: \[DedicatedServer](?:ASQDeployable::)?TakeDamage\(\): ([\w-]+)_C_(\d+): ([\d.]+) damage taken by causer (\S+) instigator (\S+) \(Online IDs:([^)]+)\) health remaining (-?[\d.]+)/,
  onMatch: (args, logParser) => {
    const deployable = args[3];
    const idsStr = args[8];
    if (!idsStr || idsStr.includes('INVALID')) return;
    if (VEHICLE_WRECK_REGEX.test(deployable)) return;

    const damage = Number.parseFloat(args[5]);
    if (damage <= 0) return;

    const data = {
      raw: args[0],
      time: args[1],
      chainID: args[2],
      deployable,
      deployableInstance: args[4],
      damage,
      weapon: args[6].replace(/_C_\d+$/, ''),
      attackerName: args[7],
      healthRemaining: Number.parseFloat(args[9])
    };

    iterateIDs(idsStr).forEach((platform, id) => {
      data['attacker' + capitalID(platform)] = id;
    });

    if (!data.attackerEOSID) return;

    logParser.emit('DEPLOYABLE_TAKE_DAMAGE', data);
  }
};
