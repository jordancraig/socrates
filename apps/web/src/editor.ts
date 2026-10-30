import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
export const Attribution = Extension.create({
  name: "attribution",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "table",
          "blockquote",
          "bulletList",
          "orderedList",
        ],
        attributes: {
          changeId: {
            default: null,
            parseHTML: (e) => e.getAttribute("data-change-id"),
            renderHTML: (a) =>
              a.changeId ? { "data-change-id": a.changeId } : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("attribution"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.attrs.changeId)
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "pending-contribution",
                    "data-change-id": node.attrs.changeId,
                    "aria-label": "Agent contribution awaiting review",
                  }),
                );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
