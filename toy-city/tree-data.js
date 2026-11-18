// Verified from the app's source. Rules and decisions only; no source code.
window.TREE_DATA = {
  "product": {
    "name": "Family tree app",
    "oneLiner": "A mobile app where a family keeps its records, documents, memories and messages, organised around a shared family tree with access rules."
  },
  "role": "I wrote the tree layout spec and built the layout engines: the hourglass canvas, the indented vertical chart and the add-relative focus layer, plus the canvas rendering and their tests.",
  "timeframe": "Oct 2026",
  "stats": [
    {
      "value": "3",
      "label": "layout engines: hourglass canvas, vertical chart, focus layer"
    },
    {
      "value": "62",
      "label": "tests on the layout engines"
    },
    {
      "value": "17",
      "label": "fixtures in the standard layout spec"
    },
    {
      "value": "5",
      "label": "line kinds, each between fixed anchor points"
    },
    {
      "value": "2",
      "label": "layouts drawn from one member list"
    }
  ],
  "constants": {
    "quarter": 0.25,
    "unitGap": 1,
    "familyGap": 1.25,
    "componentGap": 2,
    "other": [
      {
        "name": "epsilon",
        "value": 0.000001,
        "meaning": "Comparison tolerance, far below a quarter slot, so rounding never flips a decision."
      },
      {
        "name": "clearDistance",
        "value": 1,
        "meaning": "Two nodes on one row must be at least one slot (four quarter columns) apart."
      },
      {
        "name": "slotWidthDp",
        "value": 128,
        "meaning": "One slot on screen, in dp."
      },
      {
        "name": "rowGapDp",
        "value": 96,
        "meaning": "Gap between rows. Row pitch is the measured node height plus this gap."
      },
      {
        "name": "busStaggerDp",
        "value": 8,
        "meaning": "Each bus level draws this much lower than the one above it."
      },
      {
        "name": "extraBusDp",
        "value": 8,
        "meaning": "An extra parent's bus sits this far below the unstaggered bus line."
      },
      {
        "name": "zoomStep",
        "value": 1.25,
        "meaning": "Zoom factor per button press, about the viewport centre."
      },
      {
        "name": "minScale",
        "value": 0.5,
        "meaning": "Smallest zoom. A tree that fits at this scale or larger is shown whole."
      },
      {
        "name": "maxScale",
        "value": 2.5,
        "meaning": "Largest zoom. Fit never enlarges past 1."
      },
      {
        "name": "dimOpacity",
        "value": 0.4,
        "meaning": "Opacity of people and lines outside the selected person's close family."
      },
      {
        "name": "verticalCardWidthDp",
        "value": 168,
        "meaning": "Width of one card in the vertical chart."
      },
      {
        "name": "verticalIndentGapDp",
        "value": 40,
        "meaning": "Space between indents, which holds the bracket and its toggle."
      }
    ]
  },
  "model": {
    "people": "Each member has a person id, first name, optional last name, gender, life status, birth date with a precision (exact, year only or unknown), a membership status and a flag for the viewer. The server adds a relation word and a bucket for each member. The layout reads ids, names, gender, life status and birth data. Birth order puts unknown dates last, and within one year a year-only date sorts before an exact one.",
    "edges": "There are three edge types. parentOf runs from parent to child and carries a qualifier: biological (or unset), adoptive, guardian or foster. partnerOf is undirected. custom is directed, with the first person as the subject of the role. The server sends edges among active members only, and the layout drops any edge whose end is not drawn.",
    "statuses": [
      {
        "status": "active",
        "meaning": "A member who is in the tree.",
        "drawn": true
      },
      {
        "status": "pending",
        "meaning": "Invited but not yet accepted. Listed in the List view, never drawn on the tree.",
        "drawn": false
      },
      {
        "status": "living",
        "meaning": "Life status. Drawn normally.",
        "drawn": true
      },
      {
        "status": "deceased",
        "meaning": "Life status. Avatar at 60% opacity and a muted name. Screen readers hear passed away.",
        "drawn": true
      },
      {
        "status": "unborn",
        "meaning": "Life status. Drawn as living with no mark.",
        "drawn": true
      },
      {
        "status": "removed",
        "meaning": "Not sent to the app. The server still walks through them when it names relations.",
        "drawn": false
      }
    ]
  },
  "layoutRules": [
    {
      "id": "inputs",
      "title": "Who is drawn",
      "rule": "Only active members are drawn. An edge counts only when both of its ends are drawn, and an edge from a person to themselves is dropped. Edges are sorted by id before anything else.",
      "why": "The same input must give the same picture, whatever order the server sends rows in."
    },
    {
      "id": "primary-parents",
      "title": "Two primary parents",
      "rule": "A child's parent edges sort by qualifier: biological, then adoptive, then guardian, then foster, then edge id. The first two are the primary parents and decide where the child sits. A third or later parent gets its own line but never places anyone.",
      "why": "A child needs one fixed pair to centre under. More parents would pull the child in different directions."
    },
    {
      "id": "focus",
      "title": "Centre on the viewer",
      "rule": "The tree is drawn around the viewer. If the viewer is not drawn, it uses the tree admin's person. If that person is not drawn either, it uses the eldest drawn person.",
      "why": "People look for their own family first."
    },
    {
      "id": "rows",
      "title": "Rows from a generation walk",
      "rule": "A breadth-first walk starts at the focus on level 0. A parent is one level up, a child one level down, a partner on the same level. Custom edges are not walked. Neighbours are visited in edge-id order, and the first level a person gets is kept. Levels then shift so the top row is 0.",
      "why": "It follows the server's generation walk. In bad data, a cycle or a partner a generation apart cannot loop or move anyone twice."
    },
    {
      "id": "couples",
      "title": "Where partners sit",
      "rule": "The focus sits left of their living partner. In other couples the man sits left when exactly one is male, otherwise the elder, then the lower id. Deceased partners sit on the outer side, away from the living partner, in edge-id order. With no living partner, the outer side is the left.",
      "why": "The design frames put Father left of Mother and Me left of Spouse. Keeping the living couple side by side gives the drop line one clear midpoint."
    },
    {
      "id": "down",
      "title": "Down: the focus and descendants",
      "rule": "The focus goes at column 0 with their partners beside them. Children group by their other parent, one group per partner in left-to-right order, each in birth order. Each child's own descendant block packs right of the previous one with a 1.25 slot gap. The children's span centres under the parents, or the parents centre over the children when the children are wider.",
      "why": "The descendant block is built first, and everything else packs around it. Blocks pack by their left and right edge on every row they share, so nothing overlaps."
    },
    {
      "id": "siblings",
      "title": "The focus row: siblings",
      "rule": "With a living partner, the focus's siblings go left and the partner's siblings go right. Nearest come full siblings by birth order, then half siblings through the left parent, then through the right. With no partner, older full siblings go left and younger ones right, then half siblings take the side of the parent they share.",
      "why": "Each family stays on its own side of the couple, so their lines do not cross the couple."
    },
    {
      "id": "up",
      "title": "Up: parents and their families",
      "rule": "The row above holds, left to right: the left parent's siblings with their partners, the left parent's other partners, the parent pair, the right parent's other partners, then the right parent's siblings. Gaps are 1 slot inside a unit and 1.25 between units. Each parent's own parents go above, centred over that parent's group. The block centres over the focus's sibling group, then moves outward until every row is clear. The focus's side is placed first, then the partner's.",
      "why": "The father's family ends up left, the mother's to its right, and the in-laws further right above the partner."
    },
    {
      "id": "leftovers",
      "title": "Leftovers",
      "rule": "Anyone still unplaced is placed in the order the walk found them. This covers cousins, a child's in-laws and an ancestor's second family. Their anchor is the midpoint of two placed parents, else one placed parent, else one slot right of a placed partner, else a placed child, else any placed relative. Their whole descendant block is tried at the anchor, then a quarter slot right, a quarter left, half right, and so on. The first column where every row is clear wins. Passes repeat until one places nobody.",
      "why": "The earlier rules cover the common shapes. This pass makes sure everyone else lands without overlapping anyone."
    },
    {
      "id": "components",
      "title": "Separate families",
      "rule": "People not connected to the focus by parent or partner edges form other components. Each is laid out by the same rules around its eldest member, then placed right of everything with a 2 slot gap, largest first. Their top rows align with the main block's top row.",
      "why": "A pending or removed parent can split a family. The parts still show, set clearly apart."
    },
    {
      "id": "unconnected",
      "title": "The trailing row",
      "rule": "People with no parent or partner edge to anyone drawn sit in one row below everything, from the leftmost column, in name order, one slot apart. Their custom lines still draw.",
      "why": "A godparent known only by a custom relation still needs a place."
    },
    {
      "id": "output",
      "title": "Grid output",
      "rule": "Columns shift so the leftmost is 0 and are stored as whole quarter columns. Rows count from 0 at the top. Lines and the reading order are then derived from these cells.",
      "why": "The renderer and the tests work on integers, so equality is exact."
    }
  ],
  "lineKinds": [
    {
      "kind": "partner",
      "what": "A dashed horizontal line between two partners.",
      "from": "avatarCentre",
      "to": "avatarCentre"
    },
    {
      "kind": "drop",
      "what": "A vertical line. One runs from a couple's midpoint on their partner line, or from below each parent's name when there is one parent or the two are not partners, down to the bus. Then one runs from the bus down to each child. One parent drop over one child in the same column draws as a single straight drop.",
      "from": "avatarCentre (couple midpoint), nodeBottom (a parent with no partner line) or bus",
      "to": "bus or avatarTop"
    },
    {
      "kind": "bus",
      "what": "A horizontal line half a row gap above the children. There is one per set of primary parents and child row, spanning the parents' drops and the children.",
      "from": "bus",
      "to": "bus"
    },
    {
      "kind": "extraParent",
      "what": "A third or later parent's line: down from below their name, along an extra bus 8 dp under the child's bus, then down to the child.",
      "from": "nodeBottom, then extraBus",
      "to": "extraBus, then avatarTop"
    },
    {
      "kind": "custom",
      "what": "A dotted straight line between two people joined by a custom relation, such as a godparent.",
      "from": "avatarCentre",
      "to": "avatarCentre"
    }
  ],
  "busStagger": "Buses are grouped by their set of primary parents and child row, then sorted by row and by the parents' leftmost column. Each bus takes the lowest level where no bus already on that row overlaps its horizontal span. Touching ends count as an overlap. Level n draws 8 dp times n lower. Without this, a parent with children by two partners would get two buses on one line, and you could not tell which children belong to which couple.",
  "selection": {
    "stays": "Tapping a person selects them and opens their member sheet. The person, their partners, their parents (guardians and extra parents included) and their children stay at full opacity. That is everyone joined to them by a non-custom edge.",
    "dims": "Everyone else drops to 40%, and so does every line segment the selected person does not own. Owned segments draw in the brand colour. The canvas moves the node to just below the header, because the sheet can cover most of the screen.",
    "owners": "Each segment records its owners when the layout is built. A partner line belongs to both partners. A couple's drops to the bus and the bus belong to the parents. A drop to a child belongs to the parents and that child. An extra-parent line belongs to that parent and child, and a custom line to both ends.",
    "why": "Ownership is worked out once in the layout, so the painter only checks whether the selected id is in a set. Nothing walks the graph at draw time."
  },
  "vertical": [
    {
      "title": "Roots",
      "rule": "Roots are drawn members with no drawn parent. They come oldest generation first, using the standard layout's rows, then in its reading order. Members joined only by custom edges come after every other root."
    },
    {
      "title": "Partners stack",
      "rule": "A visit places the person at the next row. Their partners follow at the same indent, joined by a dashed partner line. A partner's other partners join the stack too, so a remarriage stays together."
    },
    {
      "title": "Children indent",
      "rule": "The children of everyone in the stack follow in birth order, one indent right. Each is joined to the lowest card in the stack that is their parent."
    },
    {
      "title": "Each person once",
      "rule": "A child of two people sits under the first stack that reaches them. A parent placed later gets no line to that child. Anyone a parent cycle leaves out is visited as a root, so bad data still ends."
    },
    {
      "title": "Custom relations",
      "rule": "Custom edges draw no line. The relation word on the card says it."
    },
    {
      "title": "Opening state",
      "rule": "The chart opens on the line down to the viewer and the viewer's own stack. Everything else starts closed. With no card for the viewer, every root stack opens. Roots and partners always draw."
    },
    {
      "title": "One generation at a time",
      "rule": "Opening a stack shows its children, each closed. Closing hides the branch and closes everything inside it, so reopening shows one generation again."
    },
    {
      "title": "Children beside parents",
      "rule": "The first child's middle sits level with the bracket's point, halfway between the parent cards. Tops move in half-row steps. Opening or closing moves only what lies below, so the stack stays put on screen."
    },
    {
      "title": "Finding hidden people",
      "rule": "Selecting a hidden person from search, the screen-reader list or a new add opens the stacks on the line to them, then reveals the card. Nothing persists between visits."
    },
    {
      "title": "Cards and lines",
      "rule": "Cards are 168 dp wide. A 40 dp gap between indents holds a bracket joining the stack's cards and a 24 dp toggle in a 48 dp target."
    }
  ],
  "readingOrder": {
    "rule": "Members are read row by row from the top, left to right within a row, with ties broken by person id. Screen readers reach a hidden list of 48 dp rows behind the painted canvas. Each row reads name, relation word (or you), city, country and passed away where it applies, and leaves out missing parts. When a row gains focus, the canvas reveals that node. The vertical chart keeps the same order.",
    "why": "The painted canvas has no semantics of its own. Reading row by row, oldest generation first, puts grandparents before parents before children, and it does not change when the user switches layout."
  },
  "relationWords": [
    {
      "rule": "Relation words such as Grandmother or Spouse come from the server with each member. The app never derives them on the device."
    },
    {
      "rule": "The server finds the shortest path from the viewer, as steps up to a parent, down to a child or across to a partner. The shape of the path names the word, gendered by the target's gender, with a neutral word when gender is other or not set."
    },
    {
      "rule": "Guardian and foster edges can end a path but never continue one, so a guardian's mother is nobody's grandmother. A custom edge names only the viewer's own direct relation."
    },
    {
      "rule": "Removed members stay in the server's walk. Two siblings whose shared parent was removed are still brother and sister, even though the canvas draws them as separate families."
    },
    {
      "rule": "The viewer, pending members and anyone no path reaches have no word. The node shows Me for the viewer and an empty line otherwise, so names stay aligned."
    },
    {
      "rule": "When adding a relative, a gendered relation follows the new person's gender: choosing Father for a woman switches to Mother, and the same holds for son and daughter, brother and sister."
    },
    {
      "rule": "Siblings are derived only through biological or adoptive parents. Guardians and foster parents never make two children siblings."
    }
  ],
  "addRelative": [
    {
      "action": "Open the focus layer",
      "rule": "A long-press on a person, or Add a relative on their sheet, opens a layer of seats around them. Their close family stays at 90% opacity and everything else drops to 60%."
    },
    {
      "action": "Add a parent",
      "rule": "Offered until the person has two biological or adoptive parents. Guardians and foster parents do not fill those places. The seat sits on the row above, over the person, or in the nearest free slot, left first."
    },
    {
      "action": "Add a partner",
      "rule": "One living partner per person per tree. The partner seat is hidden while a living partner exists, but Partner stays in the relation list so a former partner who has died can still be added. Adding a second living partner stops with a dialog naming the current one. An unborn partner counts as living."
    },
    {
      "action": "Add a sibling",
      "rule": "Needs at least one biological or adoptive parent, because siblings are derived through a shared parent. Without one the seat is locked and explains why. The seat sits on the side away from the partner, one slot past the outermost sibling and their partners, and extends the parents' bus."
    },
    {
      "action": "Add a child",
      "rule": "A child can take a second parent. The list offers the person's partners first, living before deceased, then every other active member by name, never the person or anyone pending. The seat sits past the last child and their partners on the couple's bus, or under the couple when there are none."
    },
    {
      "action": "Add another relation",
      "rule": "Guardian, foster, godparent, chosen family and custom relations. An adopted child needs a second parent. The seat sits beside the Child seat with no line, because it may be anyone."
    },
    {
      "action": "Make room",
      "rule": "When a seat's slot is taken, the tree is cut straight down before it and everything beyond moves outward on every row. Vertical lines move whole and horizontal ones stretch, so every line stays straight. Parent, and the Child seat when there are no children yet, take the nearest free slot instead, because a cut there would move the person too. Closing the layer restores the tree."
    },
    {
      "action": "Mark as living again",
      "rule": "Blocked when it would leave someone with two living partners."
    }
  ],
  "decisions": [
    {
      "title": "Spec before code",
      "detail": "The layout rules were written and agreed as a documentation page before the engine was coded; design review of the larger shapes is still open. The engine's header names that page as its rules and says a change to one is a change to both. The vertical chart's section went into the spec before that engine was written too. The design frames drew a four-person tree, so every larger shape had to be decided in writing where design could review it."
    },
    {
      "title": "Pure Dart engines",
      "detail": "The layout engines import only Dart's collection and math libraries, the freezed annotations and the app's own model and domain code. There is no Flutter import. They take members and edges and return cells, line segments and a reading order, so every rule runs as a plain unit test and the widget only maps the grid to dp."
    },
    {
      "title": "A quarter-slot grid",
      "detail": "Positions are slots and rows, not pixels. Every computed centre rounds down to a quarter slot, and the output stores whole quarter columns. Tests compare integers exactly, and the canvas turns rows into dp at the current text size, so large text never overlaps the row below."
    },
    {
      "title": "Deterministic tie-breaks",
      "detail": "Every choice ends in a tie-break on person id or edge id. The server returns rows in no fixed order, yet the same tree draws the same way on every load. Each layout fixture shuffles its input and asserts an identical result."
    },
    {
      "title": "Value types with owners",
      "detail": "The layout output is immutable freezed classes with value equality, and each line segment carries the people who own it. Equality lets tests and state compare layouts exactly. Owners make selection a set lookup."
    },
    {
      "title": "A second engine for the vertical chart",
      "detail": "The indented chart has its own engine with its own rules: one row per person, partners stacked, depth first. It reuses the standard layout's rows and reading order to sort its roots. The vertical view also reuses the standard reader list, so screen readers hear the same order in both layouts."
    },
    {
      "title": "Seats as a layer over a finished layout",
      "detail": "The add-relative seats come from a separate pure function that takes a finished layout and moves cells aside with a vertical cut. The base layout never changes, and closing the layer puts the tree back."
    }
  ],
  "testing": "62 tests cover the three layout engines: 24 for the standard layout, 27 for the vertical chart and its collapse rules, and 11 for the add-relative seats. Every standard fixture also asserts that each active member is placed exactly once, that no two nodes on a row are closer than one slot, and that shuffling the members and edges gives an identical layout. The vertical tests apply the same shuffle check. Relation gating adds 15 tests. The tree feature's test folder holds 569 cases in 42 files, including 6 golden image tests.",
  "limits": [
    "A person can have one living partner and any number of deceased former partners. Each couple gets its own bus to its own children.",
    "A child can have more than two parents. The first two by qualifier place the child, and every further parent draws a line on an extra bus.",
    "Overlapping buses on one row are staggered to separate levels.",
    "Families that are not connected to the viewer are laid out as separate blocks to the right, and people with no family edge sit in a trailing row.",
    "Two cousins who are partners are each placed once, and their partner line spans the gap between them.",
    "A partner recorded a generation apart, or anyone whose level does not match the rule that reaches them, is placed on their own level by the leftover pass.",
    "A cycle of parents in bad data terminates, with each person placed once.",
    "When the viewer is not in the tree, it is drawn around the admin, then the eldest member.",
    "The same members and edges in any order give the same layout.",
    "Row height grows with the system text size.",
    "Lines may cross in a large tree, and an ancestor pair can sit off-centre. Two nodes never overlap."
  ]
};
