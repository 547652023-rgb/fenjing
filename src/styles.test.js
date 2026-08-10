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

it("keeps storyboard image previews inside fixed thumbnail boxes", () => {
  expect(styles).toMatch(
    /\.image-cell--single \.image-cell__item,[\s\S]*?\.image-cell--multiple \.image-cell__item--thumbnail\s*\{[\s\S]*?height:\s*6\.75rem/,
  );
  expect(styles).not.toMatch(
    /\.image-cell--single \.image-cell__item\s*\{[\s\S]*?height:\s*100%/,
  );
});
