# Minecraft rendering resources

`vanilla-1.20.1.json.gz` contains unmodified blockstate/model JSON and block PNG
and bed/chest/banner PNG resources extracted from a local Minecraft: Java Edition 1.20.1 client. The
compressed container is a UTF-8 JSON dictionary of resource path to base64 bytes.
It contains no game executable code, sounds, third-party schematics or user data.
The metadata records the actual client version and SHA-256 provenance.

Minecraft assets are copyright Mojang Studios / Microsoft. **These files are not
licensed under this repository's MIT license.** The MIT license covers the
original application code and original example schematics only. Importing,
embedding or exporting an asset does not change its copyright or license.

- [Minecraft EULA](https://www.minecraft.net/en-us/eula)
- [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines)

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR
MICROSOFT. Schem Teacher is maintained independently by Zhan27.

`farmers-delight.json.gz` contains 23 blockstate/model/texture resources for the
stove, cutting board and cooking pot from vectorwing's Farmer's Delight 1.20 branch,
pinned to commit `e854d56d4eea8dc120650d43da0d1472711797ad`. These are mod assets,
not vanilla Minecraft blocks. They retain the author's MIT license in
`farmers-delight-LICENSE.txt`; the license is also included in standalone exports.
`farmers-delight.meta.json` records the original paths and each file's SHA-256.
