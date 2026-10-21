/**
 * hello-dsh-plugin — browser half (client face).
 *
 * Hand-written in the official client bundle contract (the same shape the
 * tsdown clientBundle preset emits): a classic-script CJS factory registered
 * through window.__ModuleLoader__.load({ id, factory }). The factory's
 * synchronous `require` resolves the platform baseline from the loader's
 * module table — react/jsx-runtime and @deepseek-ai/cordis are baseline
 * externals every dynamic bundle may request.
 *
 * The exports must be the cordis client-plugin face: { name, inject, apply }.
 * apply registers one `settings.section` list entry, which the settings shell
 * projects into the settings navigation as a new page.
 */
window.__ModuleLoader__.load({
  id: "hello-dsh-plugin",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var jsx = require("react/jsx-runtime")

    exports.name = "hello-dsh-plugin"

    // Services the apply body reads. `slots` is the registration seat; the
    // settings slot declarations live in the ui-settings shell entry, whose
    // activation order relative to this one is NOT constrained — registering
    // into a declared-but-not-yet-mounted slot is the slots.inject contract.
    exports.inject = ["slots"]

    var mountedAt = new Date().toISOString()

    exports.apply = function (ctx) {
      // slots.inject waits for the ui-settings shell's declaration, then runs
      // the registration; it removes the contribution if the declaration
      // collapses and leaves with this plugin's fiber on dispose.
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "hello",
            order: 90,
            label: function () { return "Hello Plugin" },
            inject: function () { return { mountedAt: mountedAt } },
          },
          function HelloSection(props) {
            var close = props.close
            var mountedAt = props.mountedAt
            return {
              $$typeof: Symbol.for("react.element"),
              type: "div",
              key: null,
              ref: null,
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  padding: "24px",
                  fontFamily: "inherit",
                  color: "var(--dsw-text-primary, inherit)",
                },
                children: [
                  {
                    $$typeof: Symbol.for("react.element"),
                    type: "h2",
                    key: null,
                    ref: null,
                    props: { children: "Hello from hello-dsh-plugin" },
                  },
                  {
                    $$typeof: Symbol.for("react.element"),
                    type: "p",
                    key: null,
                    ref: null,
                    props: {
                      children: "This section is contributed by a third-party dsh plugin installed at runtime — no rebuild, no restart.",
                    },
                  },
                  {
                    $$typeof: Symbol.for("react.element"),
                    type: "p",
                    key: null,
                    ref: null,
                    props: {
                      style: { opacity: 0.7, fontSize: "12px" },
                      children: "Mounted at " + mountedAt,
                    },
                  },
                  {
                    $$typeof: Symbol.for("react.element"),
                    type: "button",
                    key: null,
                    ref: null,
                    props: {
                      children: "Close settings",
                      onClick: close,
                      style: {
                        alignSelf: "flex-start",
                        padding: "6px 14px",
                        borderRadius: "6px",
                        border: "1px solid var(--dsw-border, #8888)",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                      },
                    },
                  },
                ],
              },
            }
          })
      })
    }

    return module.exports
  },
})