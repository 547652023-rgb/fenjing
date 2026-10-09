# PDF Chinese font

Noto Sans SC Regular (static TrueType, weight 400) is bundled for vector PDF export. The browser downloads
the font on demand. PDFs embed the complete font to avoid missing Chinese glyphs
caused by fontkit's CJK subsetting. This increases file size but preserves text.

Source: https://github.com/google/fonts/blob/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf

Generated with fontTools varLib.instancer at wght=400. TrueType is used because
the fontkit CFF subset of the previous CJK OpenType font was rejected by Poppler.
The TrueType subset also lost some glyphs; complete embedding was verified by rendering.

License: SIL Open Font License 1.1. The license is included alongside this font
and published at `fonts/OFL.txt` in the deployed application.
