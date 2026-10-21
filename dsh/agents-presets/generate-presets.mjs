import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const anchor = process.argv.find(argument => argument.endsWith("/@deepseek-ai/dsh/package.json"))
if (!anchor) throw new Error("Pass the selected runtime's @deepseek-ai/dsh/package.json as the generation anchor")
const requireRuntime = createRequire(anchor)
const yaml = requireRuntime("js-yaml")
const { entryListSchema } = requireRuntime("@deepseek-ai/cordis-plugin-include")
const check = process.argv.includes("--check")
try { for (const id of ["wopal", "fae", "rook"]) {
  const metadata = yaml.load(readFileSync(join(root, id, "preset.yml"), "utf8"))
  const plugins = yaml.load(readFileSync(join(root, id, "agent.cordis.yml"), "utf8"), { schema: entryListSchema })
  const declaration = [{
    insert: [{
      id: "preset-" + id,
      name: "@deepseek-ai/dsh-agent-preset",
      config: { id, ...metadata, plugins },
    }],
  }]
  const text = "# Generated from preset.yml and agent.cordis.yml by generate-presets.mjs\n"
    + yaml.dump(declaration, { schema: entryListSchema, noRefs: true, lineWidth: 120 })
  const target = join(root, id, "preset.patch.yml")
  if (check) {
    if (readFileSync(target, "utf8") !== text) throw new Error("Preset declaration drift: " + id)
  } else {
    writeFileSync(target, text)
  }
}
} catch (error) {
  console.error(error.reason ?? error.message)
  process.exitCode = 1
}
if (!process.exitCode) console.log(check ? "Preset declarations match their sources" : "Generated wopal/fae/rook preset declarations")
