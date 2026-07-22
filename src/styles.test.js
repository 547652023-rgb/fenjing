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
