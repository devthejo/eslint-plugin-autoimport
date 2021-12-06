/* eslint-disable */
"use strict";

/* inspired by https://github.com/kriszyp/eslint-plugin-auto-import/ */

const pathModule = require("path");

function isStaticRequire(node) {
  return (
    node &&
    node.callee &&
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments.length === 1 &&
    node.arguments[0].type === "Literal" &&
    typeof node.arguments[0].value === "string"
  );
}
/**
 * Checks if the given node is the argument of a typeof operator.
 * @param {ASTNode} node The AST node being checked.
 * @returns {boolean} Whether or not the node is the argument of a typeof operator.
 */
function hasTypeOfOperator(node) {
  var parent = node.parent;

  return parent.type === "UnaryExpression" && parent.operator === "typeof";
}


module.exports = {
  meta: {
    docs: {
      description: "Auto import",
      category: "Variables",
      recommended: true,
    },

    schema: [
      {
        type: "object",
        properties: {
          typeof: {
            type: "boolean",
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create: function (context) {
    var options = context.options[0];
    var considerTypeOf = (options && options.typeof === true) || false;
    const dependencies = new Set(); // keep track of dependencies

    return {
      ImportDeclaration(node) {
        dependencies.add(node.source.value);
      },

      MemberExpression: function (node) { },

      CallExpression(node) {
        if (isStaticRequire(node)) {
          const [requirePath] = node.arguments;
          dependencies.add(requirePath.value);
        }
      },
      "Program:exit": function (/* node */) {
        var globalScope = context.getScope();
        var options = context.options[0];
        //  console.log(context.eslint)
        var fixed = {};
        //  console.log(globalScope.block.body[0].specifiers[0])
        globalScope.through.forEach(function (ref) {
          var identifier = ref.identifier;

          if (!considerTypeOf && hasTypeOfOperator(identifier)) {
            return;
          }
          var undefinedIndentifier = identifier.name;
          context.report({
            node: identifier,
            message: "{{name}} is not defined.",
            data: identifier,
            fix: function (fixer) {
              if (fixed[undefinedIndentifier]) {
                return;
              }
              if (identifier.parent.type === "AssignmentExpression") {
                return fixer.insertTextBefore(identifier, "let ");
              }
              fixed[undefinedIndentifier] = true;
              var filename = context.getFilename();
              var foundModule;
              var isNotDefaultExport;

              if (!foundModule && options.packages) {
                for (var packageName in options.packages) {
                  var pckg = options.packages[packageName];
                  var packageRef =
                    pckg.as || (typeof pckg === "string" ? pckg : packageName);
                  if (packageRef === undefinedIndentifier) {
                    foundModule = packageName;
                  } else {
                    if (typeof pckg === "string") {
                      pckg = [{
                        name: pckg,
                        isDefault: true
                      }]
                    }
                    for (var exported of pckg) {
                      if (typeof exported === "string") {
                        exported = {
                          name: exported,
                          isDefault: false,
                        }
                      }
                      if (exported.name === undefinedIndentifier) {
                        foundModule = packageName;
                        isNotDefaultExport = !exported.isDefault;
                        break;
                      }
                    }
                  }
                  if (foundModule) {
                    break;
                  }
                }
              }

              if (foundModule) {
                var i = 0;
                var importDeclaration, node;
                while (
                  (node = globalScope.block.body[i++]).type ===
                  "ImportDeclaration"
                ) {
                  importDeclaration = node;
                  if (node.source.value === foundModule) {
                    if (isNotDefaultExport) {
                      let insertCode
                      // process.exit(1)
                      if (node.specifiers.some(({ type }) => type === "ImportSpecifier")) {
                        insertCode = ", " + undefinedIndentifier
                      } else {
                        insertCode = ", {" + undefinedIndentifier + "}"
                      }
                      // add to the named imports of an existing import declaration
                      return fixer.insertTextAfter(
                        node.specifiers[node.specifiers.length - 1],
                        insertCode
                      );
                    } else {
                      console.log(foundModule, "already imported");
                      return;
                    }
                  }
                }

                var importStatement =
                  (isNotDefaultExport
                    ? "import { " + undefinedIndentifier + " }"
                    : "import " + undefinedIndentifier) +
                  " from '" +
                  foundModule +
                  "'";

                if (importDeclaration) {
                  return fixer.insertTextAfter(
                    importDeclaration,
                    "\n" + importStatement
                  );
                }
                return fixer.insertTextAfterRange(
                  [0, 0],
                  importStatement + (dependencies.size === 0 ? "\n\n" : "")
                );
              }
            },
          });
        });
      },
    };
  },
};
