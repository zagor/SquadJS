# Vehicle claims handling plugin

This is a SquadJS plugin for handling vehicle claims.
It is designed around the core Squad International rules for vehicle claims:

- Vehicles are claimed by naming your squad after the claimed vehicle
- The first squad to claim gets the vehicle
- Claims last for the entire round, or until the squad is disbanded


## Claiming a vehicle

When you create a squad, the plugin checks your squad name against the list
of claimable vehicles for the current layer and faction.

If you have named your squad properly and nobody else have claim on your
desired vehicle, you will get an in-game popup saying, for example: "You
have the claim for LAV-25". If the vehicle is already claimed, you get a
message saying "LAV-25 is already claimed by squad 5" and your new squad
is immediately disbanded.

The plugin handles (nearly*) all vehicle names defined in our claim name
list. It also understands most the allowed aliases for vehicles such as
MGS, GRAD, LEO and SCIMITAR. It also understands when you need to be
specific (T72, BTR82, LAV25) and when you can use generic names (TANK, MBT,
BTR, LAV). If you try to use a generic claim when there are multiple
variants available, you will be told to make a more specific claim.

Multiple vehicles of the same type are handled per our rules: One squad per
vehicle can claim it. If the there are three LAV-25s available, the plugin
will allow three squads to claim it.

The plugin does a fuzzy match against the vehicle name, so you can call
your squad for example "TANK BOYS" or "LAV IS IN THE AIR" and it will
register a valid claim. It expects the vehicle name at the start of your
squad name, so you can not call your squad "I WANT THE MBT". It also only
matches one vehicle, so you can't multiclaim using "MBT LAV BTR HELI". That
will just (try to) claim MBT.


## Claim enforcement

If a player without claim enters the driver seat of a vehicle requiring
claim, he is shown a stern message. If nobody has yet claimed the vehicle,
the message reads:

> Claim violation!
> This vehicle must be claimed in your squad name.
> Exit the vehicle immediately.

If the vehicle is already claimed by a squad, the message is slightly different:

> Claim violation!
> Squad 5 has the claim for this vehicle.
> Exit the vehicle immediately.

If the player stays in the vehicle, he is warned again 10 seconds later:

> Claim violation!
> Exit the vehicle or be killed.
> You have 10 seconds.

As clearly stated, if the player still refuses to exit the vehicle, he is
killed. This ejects him from the vehicle as well as from his squad. It does
not disband the squad. It does not kick the player from the server.

This might sound harsh and unfriendly, but it's purpose is to be crystal
clear. Nobody will be getting killed without knowing they are violating our
rules, and choosing to ignore the warnings. It is also much less disruptive
than a kick. The player is still welcome to stay and play, he simply cannot
choose to break these rules.

The reason for using a short delay is to not give helicopter thiefs time to
take off and crash so hard it has to respawn. 20 seconds is just enough
time to lift a meter or two from the pad. The rotors may break, but the
helicopter most likely survives.


## Questions

Q: What about transporting other squads in a claimed vehicle? Will they be killed when entering?

A: No, the enforcement only applies to the driver seat.


Q: Doesn't that create a loophole where someone can enter a vehicle and
then swap to another seat and thereby block the proper squad from using the
vehicle?

A: Yes it does. I have not found a way around that. But I think most trolls
will get bored by sitting still in main. If not, it can always be handled
by a human admin.


Q: What happens when an "INFANTRY" squad 1 disbands and a new "MBT" squad 1
is created even though squad 2 is already called "TANK"? Who gets the
claim?

A: The plugin doesn't care about squad numbers, it cares about who claims
first. Since squad 2 already have claim for the tank, anyone trying to
claim it afterwards will be rejected no matter their squad number.


Q: What about rescuing other squads' vehicles? Sometimes a squad without
claim helps driving another squad's vehicle out of harms way.

A: The squad leader with claim for the vehicle can write !rescue in squad
chat to unlock his claim for 5 minutes. During that time, anyone else can
enter and drive the vehicle.
