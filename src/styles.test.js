import { readFileSync } from "node:fs";

const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

it("stacks the project home at phone width without forcing horizontal overflow", () => {
  expect(styles).toMatch(/body\s*\{[^}]*min-width:\s*(?:0|320px)/s);
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.project-home-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.project-home-sidebar\s*\{[^}]*position:\s*static/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.project-home-filters\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  expect(styles).toMatch(
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.project-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
});

it("keeps storyboard frame and reference previews in a 16:9 box without stretching", () => {
  expect(styles).toMatch(
    /\.image-cell--single \.image-cell__previews,[\s\S]*?\.image-cell--single \.image-cell__item\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s,
  );
  expect(styles).toMatch(
    /\.image-cell__preview\s*\{[^}]*object-fit:\s*contain/s,
  );
  expect(styles).toMatch(
    /\.image-cell--single \.image-cell__previews,[\s\S]*?\.image-cell--single \.image-cell__item\s*\{[^}]*max-width:\s*16rem/s,
  );
});

it("packs multiple storyboard images into a compact grid aligned to the top of the row", () => {
  expect(styles).toMatch(
    /\.image-cell--multiple \.image-cell__previews\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*16rem\)\)/s,
  );
  expect(styles).toMatch(
    /\.image-cell--multiple \.image-cell__item\s*\{[^}]*max-width:\s*16rem/s,
  );
  expect(styles).toMatch(/\.storyboard-table td\s*\{[^}]*vertical-align:\s*top/s);
});
