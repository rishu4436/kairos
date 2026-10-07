# Agentic Wallet multi-user limit

The official skill documents one local `baw` session. `auth signin` and `auth signout` have no profile, workspace, or user argument. `wallet status` has no user argument. Nothing in the skill, the settings response, or the status response describes concurrent sessions or programmatic session switching.

KAIROS therefore does not invent a second credential store. The CLI is read only for `user_demo`. Any other user receives `UNCONNECTED` and an empty address, and the CLI is not called for them. `AgenticWalletGateway` still takes a `userId` so a later session mechanism can be added without a global wallet object.

There is no `globalAgenticWallet`. Production multi-user orchestration is not implemented. This was not verified by running two sign-ins, because the documented CLI does not expose that operation and this machine is `UNCONNECTED`.
