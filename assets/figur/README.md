# Källan till kroppsfigurerna

`makehuman/` är MakeHumans basmodell (`base.obj`) och de sex makrotargets
som behövs för en ung vuxen i tre varianter (neutral, kvinna, man):
`african/asian/caucasian-female/male-young`. `scripts/rita-figur.py` gör
`public/figur/figur-*.bin` och `src/figur/figur-data.ts` av dem.

- Hämtat från: MakeHuman-gemenskapens Blender-tillägg MPFB2,
  <https://github.com/makehumancommunity/mpfb2>, katalogen `src/mpfb/data/`
  (`3dobjs/base.obj`, `targets/macrodetails/`), commit `3edf9df0`, 2026-09-28.
- Upphov: MakeHuman-teamet. Basmodellen släpptes uttryckligen som CC0 i
  september 2020 av rättighetshavarna Data Collection AB, Joel Palmius och
  Jonas Hauquier (se huvudet i `base.obj`); MPFB2:s `LICENSE.md` avsnitt C
  släpper alla bundlade tillgångar -- basmodell, targets med mera -- under
  CC0 1.0. Licenstexten ligger i `makehuman/LICENSE.md`.
- Licens: CC0 1.0 Universal. Fri att använda kommersiellt, ändra och sprida.
- Kräver namngivning: nej. (Vi nämner MakeHuman på /om ändå, av artighet.)

Tidigare låg här `FinalBaseMesh.obj` från free3d.com (Male Base Mesh, id 6682,
uppladdad av "nixor", skapad av Paul Chen). Den är borttagen: sidan anger
"Personal Use License", vilket inte tillåter användning i en kommersiell
tjänst, och upphovet är oklart.
