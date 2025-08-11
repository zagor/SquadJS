import { iterateIDs, lowerID } from 'core/id-parser';

export default {
  regex:
  /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquadCommon: SQCommonStatics Check Permissions, UniqueId:([0-9a-f]+)/,
  onMatch: (args, logParser) => {
    const eosID = args[3];
    let player = logParser.eventStore.players[eosID];
    if (!player || !player.playerSuffix || player.seen) return;
    player.seen = true;

    const data = {
      raw: args[0],
      time: args[1],
      chainID: +args[2],
      ...player
    };

    logParser.emit('PLAYER_PREFIX', data);
  }
};
