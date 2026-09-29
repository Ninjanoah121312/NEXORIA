// NEXORIA Custom Commands — Advanced editor extension point.
// Kept separate intentionally: the advanced command builder is expected to grow
// substantially without turning the main command list into one huge file.
(() => {
  window.NEXORIAAdvancedCommandEditor = window.NEXORIAAdvancedCommandEditor || {};
  window.NEXORIAAdvancedCommandEditor.version = 1;
  window.NEXORIAAdvancedCommandEditor.sections = [
    { id: "actions", title: "Actions", description: "Ordered actions, role changes, replies and visual builder nodes." },
    { id: "variables", title: "Variables", description: "Built-in and custom variables available to command content." },
    { id: "permissions", title: "Permissions", description: "Who may run the command and which roles are allowed." },
    { id: "cooldowns", title: "Cooldowns", description: "Per-user or server-wide execution limits." },
    { id: "reply-format", title: "Reply format", description: "Plain replies, embeds and future response presentation controls." },
    { id: "automation", title: "Automation", description: "Reserved for the larger advanced automation plan." }
  ];
  window.NEXORIAAdvancedCommandEditor.getHelp = function () {
    return "Advanced mode is intentionally isolated in its own module file so new command-builder capabilities can be added without making the main command list harder to maintain.";
  };
})();
