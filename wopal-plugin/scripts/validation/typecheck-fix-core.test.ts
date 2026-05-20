import { describe, it, expect } from "vitest";
import {
  parseTypeScriptDiagnostics,
  removeUnusedImport,
  getLineContent,
  classifyDiagnostics,
  formatDiagnostic,
  TS_CODES,
  TSDiagnostic,
} from "./typecheck-fix-core.js";

describe("typecheck-fix-core", () => {
  describe("parseTypeScriptDiagnostics", () => {
    it("should parse single diagnostic", () => {
      const output = "src/file.ts(10,5): error TS2322: Type 'X' is not assignable to type 'Y'.";
      const diagnostics = parseTypeScriptDiagnostics(output);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toEqual({
        file: "src/file.ts",
        line: 10,
        character: 5,
        code: 2322,
        message: "Type 'X' is not assignable to type 'Y'.",
      });
    });

    it("should parse multiple diagnostics", () => {
      const output = `
src/a.ts(1,2): error TS6196: 'foo' is declared but its value is never read.
src/b.ts(5,10): error TS2322: Type 'string' is not assignable to type 'number'.
`;
      const diagnostics = parseTypeScriptDiagnostics(output);

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].code).toBe(6196);
      expect(diagnostics[1].code).toBe(2322);
    });

    it("should skip warnings", () => {
      const output = "src/file.ts(10,5): warning TS6133: 'x' is declared but never used.";
      const diagnostics = parseTypeScriptDiagnostics(output);

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle empty output", () => {
      const diagnostics = parseTypeScriptDiagnostics("");
      expect(diagnostics).toHaveLength(0);
    });

    it("should handle malformed output", () => {
      const output = "some random text\nnot a diagnostic\nsrc/file.ts(invalid): error TS123";
      const diagnostics = parseTypeScriptDiagnostics(output);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("getLineContent", () => {
    it("should extract line from content", () => {
      const content = "line1\nline2\nline3";
      expect(getLineContent(content, 1)).toBe("line1");
      expect(getLineContent(content, 2)).toBe("line2");
      expect(getLineContent(content, 3)).toBe("line3");
    });

    it("should return empty string for invalid line", () => {
      const content = "line1\nline2";
      expect(getLineContent(content, 10)).toBe("");
    });
  });

  describe("removeUnusedImport", () => {
    it("should remove single unused import specifier", () => {
      const content = "import { unusedFoo, usedBar } from 'module'\nconsole.log(usedBar);";
      const result = removeUnusedImport(content, 1, 10, "'unusedFoo' is declared but never used.");

      expect(result).toBe("import { usedBar } from 'module'\nconsole.log(usedBar);");
    });

    it("should remove entire import if all specifiers unused", () => {
      const content = "import { unused } from 'module'\n// no usage";
      const result = removeUnusedImport(content, 1, 10, "'unused' is declared but never used.");

      expect(result).toBe("\n// no usage");
    });

    it("should handle renamed imports", () => {
      const content = "import { Foo as unusedAlias, Bar } from 'module'\nconsole.log(Bar);";
      const result = removeUnusedImport(content, 1, 10, "'unusedAlias' is declared but never used.");

      expect(result).toBe("import { Bar } from 'module'\nconsole.log(Bar);");
    });

    it("should handle single import (entire line removal)", () => {
      const content = "import unusedModule from 'module'\n// other code";
      const result = removeUnusedImport(content, 1, 10, "'unusedModule' is declared but never used.");

      expect(result).toBe("\n// other code");
    });

    it("should not modify content if not import line", () => {
      const content = "const x = 1;\nconsole.log(x);";
      const result = removeUnusedImport(content, 1, 10, "'y' is declared but never used.");

      expect(result).toBe(content);
    });

    it("should not modify if specifier name not found in message", () => {
      const content = "import { Foo } from 'module'";
      const result = removeUnusedImport(content, 1, 10, "generic error without specifier");

      expect(result).toBe(content);
    });
  });

  describe("classifyDiagnostics", () => {
    it("should classify unused import as fixable", () => {
      const diagnostics: TSDiagnostic[] = [
        {
          file: "src/test.ts",
          line: 1,
          character: 10,
          code: TS_CODES.UNUSED_IMPORT,
          message: "'unusedFoo' is declared but never used.",
        },
      ];

      const filesContent = {
        "src/test.ts": "import { unusedFoo } from 'module'",
      };

      const { fixable, manual } = classifyDiagnostics(diagnostics, filesContent);

      expect(fixable).toHaveLength(1);
      expect(manual).toHaveLength(0);
    });

    it("should classify non-import unused declaration as manual", () => {
      const diagnostics: TSDiagnostic[] = [
        {
          file: "src/test.ts",
          line: 10,
          character: 5,
          code: TS_CODES.UNUSED_VAR,
          message: "'unusedVar' is declared but never used.",
        },
      ];

      const filesContent = {
        "src/test.ts": "const unusedVar = 42;",
      };

      const { fixable, manual } = classifyDiagnostics(diagnostics, filesContent);

      expect(fixable).toHaveLength(0);
      expect(manual).toHaveLength(1);
    });

    it("should classify unknown type mismatch as manual", () => {
      const diagnostics: TSDiagnostic[] = [
        {
          file: "src/test.ts",
          line: 10,
          character: 5,
          code: TS_CODES.TYPE_MISMATCH,
          message: "Type 'string' is not assignable to type 'number'.",
        },
      ];

      const filesContent = {
        "src/test.ts": "const x: number = 'string';",
      };

      const { fixable, manual } = classifyDiagnostics(diagnostics, filesContent);

      expect(fixable).toHaveLength(0);
      expect(manual).toHaveLength(1);
    });

    it("should classify Promise<void> → Promise<unknown> as fixable (in types.ts)", () => {
      const diagnostics: TSDiagnostic[] = [
        {
          file: "src/types.ts",
          line: 167,
          character: 5,
          code: TS_CODES.TYPE_MISMATCH,
          message: "Type 'Promise<void>' is not assignable to type 'Promise<unknown>'.",
        },
      ];

      const filesContent = {
        "src/types.ts": "delete(args: { path: { id: string } }): Promise<void>",
      };

      const { fixable, manual } = classifyDiagnostics(diagnostics, filesContent);

      expect(fixable).toHaveLength(1);
      expect(manual).toHaveLength(0);
    });

    it("should handle empty diagnostics", () => {
      const { fixable, manual } = classifyDiagnostics([], {});

      expect(fixable).toHaveLength(0);
      expect(manual).toHaveLength(0);
    });
  });

  describe("formatDiagnostic", () => {
    it("should format diagnostic in readable format", () => {
      const diag: TSDiagnostic = {
        file: "src/test.ts",
        line: 10,
        character: 5,
        code: 2322,
        message: "Type mismatch",
      };

      const formatted = formatDiagnostic(diag);

      expect(formatted).toBe("src/test.ts:10:5 TS2322 Type mismatch");
    });
  });
});