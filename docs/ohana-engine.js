/*
 * ohana-engine.js
 *
 * The My Ohana family-tree layout engines, ported line for line from the Flutter app's Dart:
 *
 *   lib/features/tree/domain/tree_layout.dart      layoutTree, closeFamilyOf   (the "hourglass" canvas)
 *   lib/features/tree/domain/vertical_layout.dart  layoutVertical, collapseVertical, branchesOf, ...
 *   lib/features/tree/domain/tree_seats.dart       focusLayoutFor              (the add-relative focus layer)
 *   lib/features/tree/domain/member_order.dart     orderMembers, compareByBirth
 *   lib/features/tree/domain/relation_gating.dart  AnchorFacts, groupOf, relationForGender, revivalConflict
 *   lib/shared/tree/domain/tree_member.dart        the enums
 *
 * The rules are written up in apps/documentation/docs/mobile/tree-layout.md.
 *
 * A plain script: no modules, no build. It defines window.OhanaEngine in a browser and
 * globalThis.OhanaEngine elsewhere (Node: require('./ohana-engine.js') also returns it).
 *
 * Data shapes. Freezed classes become plain objects with the same field names; enums become the
 * Dart enum names as strings (EdgeType.parentOf === 'parentOf').
 *
 *   TreeMember  { personId, firstName, lastName?, gender, lifeStatus, birthPrecision, birthDate?,
 *                 status, isMe, ... }   birthDate: a Date, 'YYYY', 'YYYY-MM-DD', or {year, month, day}
 *   TreeEdge    { id, type, person1Id, person2Id, qualifier? }
 *   TreeCell    { quarterColumn, row }
 *   TreePoint   { quarterColumn, row, anchor, busLevel }        busLevel is always present (default 0)
 *   TreeSegment { from, to, kind, owners }                      owners: ARRAY of personIds, no duplicates,
 *                                                               in Dart's Set insertion order
 *   TreeLayout  { cells, segments, readingOrder, rows, quarterColumns, focusId }
 *                 cells: plain object personId -> TreeCell (Dart Map); focusId null when nothing is drawn
 *
 * Other Dart Sets returned by the API (closeFamilyOf, AnchorFacts.pills, blocksToward, openingBlocks,
 * closeBranch) are JS Sets; branchesOf returns a JS Map. Set parameters accept a Set or an array.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------------------------
  // Enums (tree_member.dart, tree_layout.dart, vertical_layout.dart, relation_gating.dart)
  // ---------------------------------------------------------------------------------------------

  function enumOf(names) {
    var e = {};
    names.forEach(function (n) { e[n] = n; });
    return Object.freeze(e);
  }

  var Gender = enumOf(['male', 'female', 'other']);
  var LifeStatus = enumOf(['living', 'deceased', 'unborn']);
  /** How much of a birth date is known: the whole date, the year only, or nothing. */
  var BirthPrecision = enumOf(['exact', 'year', 'unknown']);
  /** Active members are drawn and walked; pending ones are invited and only listed. */
  var MemberStatus = enumOf(['active', 'pending']);
  var AccessLevel = enumOf(['limited', 'view', 'manage', 'fullAccess']);
  /** The path shape a relation word falls under; the List view filters by it. */
  var RelationBucket = enumOf(['spouse', 'child', 'parent', 'sibling', 'grandparent', 'extended']);
  var EdgeType = enumOf(['parentOf', 'partnerOf', 'custom']);
  /** How a parent is a parent; guardians and fosters never make siblings. */
  var ParentQualifier = enumOf(['biological', 'adoptive', 'guardian', 'foster']);

  /** Where a line segment ends on a node or between rows; a node's bottom is below its name, so no line crosses it. */
  var TreeAnchor = enumOf(['avatarCentre', 'avatarTop', 'nodeBottom', 'bus', 'extraBus']);
  /** What a line segment draws. */
  var TreeSegmentKind = enumOf(['partner', 'drop', 'bus', 'extraParent', 'custom']);

  /** Which arrangement Tree detail draws: the generational canvas or the indented chart. */
  var TreeArrangement = enumOf(['standard', 'vertical']);
  /** What joins two cards: a parent to a child, or two partners stacked one under the other. */
  var VerticalLinkKind = enumOf(['child', 'partner']);

  /** The pills around the person a member is added beside; each opens a group of relations. */
  var RELATION_GROUPS = ['parents', 'partner', 'siblings', 'children', 'others'];
  var RelationGroup = enumOf(RELATION_GROUPS);

  // ---------------------------------------------------------------------------------------------
  // Small helpers standing in for Dart's library calls
  // ---------------------------------------------------------------------------------------------

  // Dart's String.compareTo: UTF-16 code units, as JS's < does.
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function cmpNum(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function minOf(xs) { return xs.reduce(function (a, b) { return Math.min(a, b); }); }
  function maxOf(xs) { return xs.reduce(function (a, b) { return Math.max(a, b); }); }
  function push(map, key, value) {
    var list = map.get(key);
    if (!list) { list = []; map.set(key, list); }
    list.push(value);
  }
  // A Dart Set literal of strings, kept as an array: insertion order, no duplicates.
  function uniq(xs) {
    var seen = new Set();
    var out = [];
    xs.forEach(function (x) { if (!seen.has(x)) { seen.add(x); out.push(x); } });
    return out;
  }
  function toSet(xs) { return xs instanceof Set ? xs : new Set(xs || []); }
  function mapToObject(map) {
    var o = {};
    map.forEach(function (v, k) { o[k] = v; });
    return o;
  }
  function objectToMap(o) {
    if (o instanceof Map) return new Map(o);
    var m = new Map();
    Object.keys(o || {}).forEach(function (k) { m.set(k, o[k]); });
    return m;
  }
  function point(quarterColumn, row, anchor, busLevel) {
    return { quarterColumn: quarterColumn, row: row, anchor: anchor, busLevel: busLevel || 0 };
  }
  function samePoint(a, b) {
    return a.quarterColumn === b.quarterColumn && a.row === b.row && a.anchor === b.anchor && a.busLevel === b.busLevel;
  }

  // TreeMember getters.
  function fullName(m) { return m.lastName != null ? m.firstName + ' ' + m.lastName : m.firstName; }
  function isDeceased(m) { return m.lifeStatus === LifeStatus.deceased; }
  function isPending(m) { return m.status === MemberStatus.pending; }

  // The year, month and day of a birth date, whatever form the page gives it in.
  function birthParts(d) {
    if (d == null) return null;
    if (d instanceof Date) return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    if (typeof d === 'number') return { year: d, month: 1, day: 1 };
    if (typeof d === 'string') {
      var m = /^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(d);
      if (!m) return null;
      return { year: +m[1], month: m[2] ? +m[2] : 1, day: m[3] ? +m[3] : 1 };
    }
    return { year: d.year, month: d.month || 1, day: d.day || 1 };
  }

  // ---------------------------------------------------------------------------------------------
  // member_order.dart
  // ---------------------------------------------------------------------------------------------

  // The List view frame's order: spouse, children, parents, grandparents, siblings, then everyone else.
  var BUCKET_ORDER = ['spouse', 'child', 'parent', 'grandparent', 'sibling', 'extended'];

  /**
   * The List view's and search's order: you first, then by relation, then
   * the members with no relation (pending ones); each group eldest first.
   */
  function orderMembers(members) {
    function rank(member) {
      if (member.isMe) return -1;
      var bucket = member.relation ? member.relation.bucket : null;
      return bucket == null ? BUCKET_ORDER.length : BUCKET_ORDER.indexOf(bucket);
    }
    return Array.from(members).sort(function (a, b) {
      var byRank = cmpNum(rank(a), rank(b));
      return byRank !== 0 ? byRank : compareByBirth(a, b);
    });
  }

  /**
   * Eldest first: unknown dates last; within a year, a year-only date before an
   * exact one; then first name, last name and id, so the order never varies.
   */
  function compareByBirth(a, b) {
    var x = a.birthPrecision === BirthPrecision.unknown ? null : birthParts(a.birthDate);
    var y = b.birthPrecision === BirthPrecision.unknown ? null : birthParts(b.birthDate);
    if (x != null && y != null) {
      var year = cmpNum(x.year, y.year);
      if (year !== 0) return year;
      var aExact = a.birthPrecision === BirthPrecision.exact;
      var bExact = b.birthPrecision === BirthPrecision.exact;
      if (aExact !== bExact) return aExact ? 1 : -1;
      if (aExact) {
        var day = cmpNum(x.month * 32 + x.day, y.month * 32 + y.day);
        if (day !== 0) return day;
      }
    } else if (x != null || y != null) {
      return x == null ? 1 : -1;
    }
    var first = cmpStr(a.firstName.toLowerCase(), b.firstName.toLowerCase());
    if (first !== 0) return first;
    var last = cmpStr((a.lastName || '').toLowerCase(), (b.lastName || '').toLowerCase());
    return last !== 0 ? last : cmpStr(a.personId, b.personId);
  }

  // ---------------------------------------------------------------------------------------------
  // tree_layout.dart
  // ---------------------------------------------------------------------------------------------

  // Gaps between the nearest nodes on a row, in slots.
  var UNIT_GAP = 1;
  var FAMILY_GAP = 1.25;
  var COMPONENT_GAP = 2;

  // A comparison tolerance far below a quarter slot.
  var EPSILON = 1e-6;

  function floorQuarter(value) { return Math.floor(value * 4 + EPSILON) / 4; }

  function qualifierRank(qualifier) {
    switch (qualifier) {
      case ParentQualifier.adoptive: return 1;
      case ParentQualifier.guardian: return 2;
      case ParentQualifier.foster: return 3;
      default: return 0; // null or biological
    }
  }

  function pairKey(a, b) { return cmpStr(a, b) < 0 ? a + '|' + b : b + '|' + a; }

  /**
   * Lays out the active members of a tree as an hourglass around the caller.
   *
   * layoutTree({members, edges, adminPersonId?}) -> TreeLayout
   *
   * The rules are `apps/documentation/docs/mobile/tree-layout.md`; this is
   * their implementation, so a change to one is a change to both.
   */
  function layoutTree(args) {
    return new Engine(args.members || [], args.edges || [], args.adminPersonId == null ? null : args.adminPersonId).run();
  }

  function Engine(members, edges, adminPersonId) {
    var self = this;
    this.people = new Map();
    members.forEach(function (member) {
      if (member.status === MemberStatus.active) self.people.set(member.personId, member);
    });
    this.adminPersonId = adminPersonId;
    this.parentEdges = new Map();
    this.partnerEdges = new Map();
    this.primaryParents = new Map();
    this.children = new Map();
    this.adjacency = new Map(); // id -> [[other, levelDelta]]

    // Every placement, in slots; levels relative to the main focus.
    this.col = new Map();
    this.level = new Map();

    // People already given a place by some rule, placed or about to be.
    this.claimed = new Set();

    this.edges = edges.filter(function (edge) {
      return edge.person1Id !== edge.person2Id && self.people.has(edge.person1Id) && self.people.has(edge.person2Id);
    }).sort(function (a, b) { return cmpStr(a.id, b.id); });

    this.edges.forEach(function (edge) {
      if (edge.type === EdgeType.parentOf) {
        push(self.adjacency, edge.person2Id, [edge.person1Id, -1]);
        push(self.adjacency, edge.person1Id, [edge.person2Id, 1]);
      } else if (edge.type === EdgeType.partnerOf) {
        push(self.adjacency, edge.person1Id, [edge.person2Id, 0]);
        push(self.adjacency, edge.person2Id, [edge.person1Id, 0]);
      }
      if (edge.type === EdgeType.parentOf) {
        push(self.parentEdges, edge.person2Id, edge);
      } else if (edge.type === EdgeType.partnerOf) {
        push(self.partnerEdges, edge.person1Id, edge);
        push(self.partnerEdges, edge.person2Id, edge);
      }
    });
    this.parentEdges.forEach(function (list, child) {
      list.sort(function (a, b) {
        var rank = cmpNum(qualifierRank(a.qualifier), qualifierRank(b.qualifier));
        return rank !== 0 ? rank : cmpStr(a.id, b.id);
      });
      var primary = list.slice(0, 2).map(function (edge) { return edge.person1Id; });
      self.primaryParents.set(child, primary);
      primary.forEach(function (parent) { push(self.children, parent, child); });
    });
  }

  Engine.prototype.run = function () {
    var self = this;
    if (this.people.size === 0) {
      return { cells: {}, segments: [], readingOrder: [], rows: 0, quarterColumns: 0, focusId: null };
    }
    var focus = this.mainFocus();
    var components = this.components();
    var main = components.find(function (c) { return c.has(focus); });
    var discovery = this.walk(focus, 0);
    var global = new Block(this.level);
    this.hourglass(focus, global, discovery);

    var others = components.filter(function (c) { return c !== main && c.size > 1; });
    var singles = components.filter(function (c) { return c !== main && c.size === 1; })
      .map(function (c) { return c.values().next().value; });
    var focusOf = new Map();
    others.forEach(function (c) { focusOf.set(c, self.eldest(c)); });
    others.sort(function (a, b) {
      var size = cmpNum(b.size, a.size);
      return size !== 0 ? size : self.byName(focusOf.get(a), focusOf.get(b));
    });
    var topLevel = minOf(Array.from(this.level.values()));
    others.forEach(function (component) {
      var localFocus = focusOf.get(component);
      var local = new Block(self.level);
      var order = self.walk(localFocus, 0);
      var top = minOf(Array.from(component).map(function (id) { return self.level.get(id); }));
      component.forEach(function (id) { self.level.set(id, self.level.get(id) - top + topLevel); });
      self.hourglass(localFocus, local, order);
      global.place(local, true, COMPONENT_GAP);
    });

    if (singles.length > 0) {
      singles.sort(function (a, b) { return self.byName(a, b); });
      var row = maxOf(Array.from(this.level.values())) + 1;
      var start = global.isEmpty() ? 0 : global.minAll();
      singles.forEach(function (id, i) {
        self.level.set(id, row);
        global.put(id, start + i);
      });
    }
    global.cols.forEach(function (v, k) { self.col.set(k, v); });
    return this.result(focus);
  };

  // The caller, else the admin, else the eldest drawn person.
  Engine.prototype.mainFocus = function () {
    var found = null;
    this.people.forEach(function (member) { if (found == null && member.isMe) found = member.personId; });
    if (found != null) return found;
    var admin = this.adminPersonId;
    if (admin != null && this.people.has(admin)) return admin;
    return this.eldest(this.people.keys());
  };

  Engine.prototype.eldest = function (ids) {
    var self = this;
    return Array.from(ids).reduce(function (a, b) { return self.byBirth(a, b) <= 0 ? a : b; });
  };

  Engine.prototype.byName = function (a, b) {
    var x = this.people.get(a);
    var y = this.people.get(b);
    var first = cmpStr(x.firstName.toLowerCase(), y.firstName.toLowerCase());
    if (first !== 0) return first;
    var last = cmpStr((x.lastName || '').toLowerCase(), (y.lastName || '').toLowerCase());
    return last !== 0 ? last : cmpStr(a, b);
  };

  Engine.prototype.byBirth = function (a, b) { return compareByBirth(this.people.get(a), this.people.get(b)); };

  // People joined by parent or partner edges.
  Engine.prototype.components = function () {
    var self = this;
    var seen = new Set();
    var result = [];
    Array.from(this.people.keys()).sort(cmpStr).forEach(function (start) {
      if (seen.has(start)) return;
      var component = new Set([start]);
      var queue = [start];
      seen.add(start);
      while (queue.length > 0) {
        self.neighbours(queue.shift()).forEach(function (pair) {
          var next = pair[0];
          if (!seen.has(next)) {
            seen.add(next);
            component.add(next);
            queue.push(next);
          }
        });
      }
      result.push(component);
    });
    return result;
  };

  // Parents one level up, children one down, partners level; edges in id order.
  Engine.prototype.neighbours = function (id) { return this.adjacency.get(id) || []; };

  // The generation walk from [focus]; returns the people in the order it reached them.
  Engine.prototype.walk = function (focus, offset) {
    var self = this;
    this.level.set(focus, offset);
    var order = [focus];
    var queue = [focus];
    var seen = new Set([focus]);
    while (queue.length > 0) {
      var current = queue.shift();
      this.neighbours(current).forEach(function (pair) {
        var next = pair[0];
        if (!seen.has(next)) {
          seen.add(next);
          self.level.set(next, self.level.get(current) + pair[1]);
          order.push(next);
          queue.push(next);
        }
      });
    }
    return order;
  };

  Engine.prototype.isLiving = function (id) { return this.people.get(id).lifeStatus !== LifeStatus.deceased; };

  Engine.prototype.partnersOf = function (id) {
    return (this.partnerEdges.get(id) || []).map(function (edge) {
      return edge.person1Id === id ? edge.person2Id : edge.person1Id;
    });
  };

  // The living partner and the others, among the unclaimed people on [id]'s level.
  Engine.prototype.splitPartners = function (id) {
    var self = this;
    var living = null;
    var others = [];
    this.partnersOf(id).forEach(function (partner) {
      if (self.claimed.has(partner) || self.level.get(partner) !== self.level.get(id)) return;
      if (living == null && self.isLiving(partner)) {
        living = partner;
      } else {
        others.push(partner);
      }
    });
    return { living: living, others: others };
  };

  // Whether [a] sits left of [b] in a pair: the male one, else the elder, else the lower id.
  Engine.prototype.leftOf = function (a, b) {
    var x = this.people.get(a).gender;
    var y = this.people.get(b).gender;
    if ((x === Gender.male) !== (y === Gender.male)) return x === Gender.male;
    return this.byBirth(a, b) <= 0;
  };

  Engine.prototype.primary = function (id) { return this.primaryParents.get(id) || []; };

  // The two primary parents in couple order; one or none when fewer are known.
  Engine.prototype.orderedParents = function (id) {
    var parents = this.primary(id);
    if (parents.length < 2) return parents;
    return this.leftOf(parents[0], parents[1]) ? parents : [parents[1], parents[0]];
  };

  /**
   * [id]'s unclaimed siblings on their level, nearest first: full siblings
   * by birth, then half siblings through the left parent, then the right.
   */
  Engine.prototype.siblings = function (id) {
    var self = this;
    var parents = this.orderedParents(id);
    var own = new Set(parents);
    var full = [];
    var viaLeft = [];
    var viaRight = [];
    var candidates = new Set();
    parents.forEach(function (parent) {
      (self.children.get(parent) || []).forEach(function (c) { candidates.add(c); });
    });
    candidates.delete(id);
    candidates.forEach(function (other) {
      if (self.claimed.has(other) || self.level.get(other) !== self.level.get(id)) return;
      var theirs = new Set(self.primary(other));
      var containsAll = Array.from(own).every(function (p) { return theirs.has(p); });
      if (theirs.size === own.size && containsAll) {
        full.push(other);
      } else if (parents.length > 0 && theirs.has(parents[0])) {
        viaLeft.push(other);
      } else {
        viaRight.push(other);
      }
    });
    var byBirth = function (a, b) { return self.byBirth(a, b); };
    full.sort(byBirth);
    viaLeft.sort(byBirth);
    viaRight.sort(byBirth);
    return { full: full, viaLeft: viaLeft, viaRight: viaRight };
  };

  // Builds the main block, or another component's, around [focus].
  Engine.prototype.hourglass = function (focus, global, discovery) {
    var self = this;
    // 1. Down.
    var down = this.desc(focus, true);
    down.shift(-down.cols.get(focus));
    global.addAll(down);
    var partner = down.livingPartnerOfHead;

    // 2. The focus row.
    var focusGroup = [focus];
    var partnerGroup = partner != null ? [partner] : [];
    var mine = this.siblings(focus);
    if (partner != null) {
      mine.full.concat(mine.viaLeft, mine.viaRight).forEach(function (sibling) {
        if (self.claimed.has(sibling)) return;
        global.place(self.desc(sibling), false, FAMILY_GAP);
        focusGroup.push(sibling);
      });
      var theirs = this.siblings(partner);
      theirs.full.concat(theirs.viaLeft, theirs.viaRight).forEach(function (sibling) {
        if (self.claimed.has(sibling)) return;
        global.place(self.desc(sibling), true, FAMILY_GAP);
        partnerGroup.push(sibling);
      });
    } else {
      var before = mine.full.filter(function (s) { return self.byBirth(s, focus) < 0; }).reverse();
      var after = mine.full.filter(function (s) { return self.byBirth(s, focus) >= 0; });
      var placeSide = function (list, rightOf) {
        list.forEach(function (sibling) {
          if (!self.claimed.has(sibling)) {
            global.place(self.desc(sibling), rightOf, FAMILY_GAP);
            focusGroup.push(sibling);
          }
        });
      };
      placeSide(before, false);
      placeSide(after, true);
      placeSide(mine.viaLeft, false);
      placeSide(mine.viaRight, true);
    }

    // 3. Up.
    this.placeUp(focus, focusGroup, global, true);
    if (partner != null) this.placeUp(partner, partnerGroup, global, false);

    // 4. Leftovers, until a pass places no one.
    var progress = true;
    while (progress) {
      progress = false;
      discovery.forEach(function (id) {
        if (self.claimed.has(id)) return;
        var anchor = self.anchorFor(id, global);
        if (anchor == null) return;
        var block = self.desc(id);
        block.shift(anchor - block.cols.get(id));
        global.placeNearest(block);
        progress = true;
      });
    }
  };

  // Where a leftover wants to sit: under placed parents, beside a partner, over a child, near any relative.
  Engine.prototype.anchorFor = function (id, global) {
    var parents = this.primary(id).filter(function (p) { return global.cols.has(p); })
      .map(function (p) { return global.cols.get(p); });
    if (parents.length === 2) return floorQuarter((parents[0] + parents[1]) / 2);
    if (parents.length === 1) return parents[0];
    var i, col;
    var partners = this.partnersOf(id);
    for (i = 0; i < partners.length; i++) {
      col = global.cols.get(partners[i]);
      if (col != null) return col + UNIT_GAP;
    }
    var kids = this.children.get(id) || [];
    for (i = 0; i < kids.length; i++) {
      col = global.cols.get(kids[i]);
      if (col != null) return col;
    }
    var near = this.neighbours(id);
    for (i = 0; i < near.length; i++) {
      col = global.cols.get(near[i][0]);
      if (col != null) return col;
    }
    return null;
  };

  /**
   * [id] with their partners on top and every unclaimed descendant below,
   * children centred under the top row. [isFocus] keeps the focus left of
   * their living partner.
   */
  Engine.prototype.desc = function (id, isFocus) {
    var self = this;
    var block = new Block(this.level);
    this.claimed.add(id);
    var split = this.splitPartners(id);
    var living = split.living;
    var others = split.others;
    others.forEach(function (o) { self.claimed.add(o); });
    if (living != null) this.claimed.add(living);
    others.sort(function (a, b) { return cmpStr(self.partnerEdgeId(id, a), self.partnerEdgeId(id, b)); });

    // The top row, left to right.
    var top = [];
    var headLeft = living == null || isFocus || this.leftOf(id, living);
    if (headLeft) {
      top = others.slice().reverse().concat([id], living != null ? [living] : []);
    } else {
      top = [living, id].concat(others);
    }
    top.forEach(function (person, i) { block.put(person, i * UNIT_GAP); });
    block.livingPartnerOfHead = living;

    // Children by co-parent, in top-row order; P's own group sits at P's position.
    var partnersInTop = new Set(top.filter(function (p) { return p !== id; }));
    var groups = top.map(function (person) {
      var group = [];
      (self.children.get(id) || []).forEach(function (child) {
        if (self.claimed.has(child) || self.level.get(child) !== self.level.get(id) + 1) return;
        var parents = self.primary(child);
        var other = parents.find(function (p) { return p !== id; });
        if (other === undefined) other = null;
        var belongs = person === id ? other == null || !partnersInTop.has(other) : other === person;
        if (belongs) group.push(child);
      });
      group.sort(function (a, b) { return self.byBirth(a, b); });
      return group;
    });
    var children = new Block(this.level);
    var heads = [];
    groups.forEach(function (group) {
      group.forEach(function (child) {
        if (self.claimed.has(child)) return;
        var sub = self.desc(child);
        if (children.isEmpty()) {
          children.addAll(sub);
        } else {
          children.place(sub, true, FAMILY_GAP);
        }
        heads.push(child);
      });
    });
    if (heads.length > 0) {
      var headCols = heads.map(function (h) { return children.cols.get(h); });
      var childLeft = minOf(headCols);
      var childRight = maxOf(headCols);
      var topCentre = (top.length - 1) * UNIT_GAP / 2;
      children.shift(floorQuarter(topCentre - (childLeft + childRight) / 2));
      block.addAll(children);
    }
    return block;
  };

  Engine.prototype.partnerEdgeId = function (id, partner) {
    return (this.partnerEdges.get(id) || []).find(function (e) {
      return e.person1Id === partner || e.person2Id === partner;
    }).id;
  };

  /**
   * Places [id]'s up-tree centred over [group], moving it outward until
   * every row it touches is clear.
   */
  Engine.prototype.placeUp = function (id, group, global, outwardLeft) {
    var up = this.up(id);
    if (up == null) return;
    var cols = group.map(function (g) { return global.cols.get(g); });
    var centre = floorQuarter((minOf(cols) + maxOf(cols)) / 2);
    up.block.shift(centre - up.pairMid);
    global.placeNearest(up.block, outwardLeft, !outwardLeft);
  };

  /**
   * The block above [id]: their parents with the parents' siblings and other
   * partners on one row, and each parent's own up-tree above them.
   */
  Engine.prototype.up = function (id) {
    var self = this;
    var parents = this.orderedParents(id).filter(function (parent) {
      return !self.claimed.has(parent) && self.level.get(parent) === self.level.get(id) - 1;
    });
    if (parents.length === 0) return null;
    parents.forEach(function (p) { self.claimed.add(p); });
    var left = parents[0];
    var right = parents.length > 1 ? parents[1] : null;

    function otherPartners(person) {
      var result = self.partnersOf(person).filter(function (partner) {
        return partner !== left && partner !== right && !self.claimed.has(partner) &&
          self.level.get(partner) === self.level.get(person);
      }).sort(function (a, b) { return cmpStr(self.partnerEdgeId(person, a), self.partnerEdgeId(person, b)); });
      result.forEach(function (p) { self.claimed.add(p); });
      return result;
    }

    function siblingUnits(person, onLeft) {
      var siblings = self.siblings(person);
      var units = [];
      siblings.full.concat(siblings.viaLeft, siblings.viaRight).forEach(function (sibling) {
        if (self.claimed.has(sibling)) return;
        self.claimed.add(sibling);
        var partners = self.partnersOf(sibling).filter(function (partner) {
          return !self.claimed.has(partner) && self.level.get(partner) === self.level.get(sibling);
        });
        partners.forEach(function (p) { self.claimed.add(p); });
        units.push(onLeft ? partners.slice().reverse().concat([sibling]) : [sibling].concat(partners));
      });
      return units;
    }

    var leftOthers = otherPartners(left);
    var rightOthers = right == null ? [] : otherPartners(right);
    var leftUnits = siblingUnits(left, true);
    var rightUnits = right == null ? [] : siblingUnits(right, false);

    // Left to right: the left parent's sibling units outermost first, the pair, the right parent's.
    var units = leftUnits.slice().reverse().concat(
      [leftOthers.slice().reverse().concat([left], right != null ? [right] : [], rightOthers)],
      rightUnits
    );
    var block = new Block(this.level);
    var col = 0.0;
    units.forEach(function (unit, u) {
      if (u > 0) col += FAMILY_GAP - UNIT_GAP;
      unit.forEach(function (person) {
        block.put(person, col);
        col += UNIT_GAP;
      });
    });
    var pairMid = right == null ? block.cols.get(left) : floorQuarter((block.cols.get(left) + block.cols.get(right)) / 2);

    function groupCentre(person, unitsOf, onLeft) {
      var heads = [person].concat(unitsOf.map(function (unit) { return onLeft ? unit[unit.length - 1] : unit[0]; }));
      var cols = heads.map(function (h) { return block.cols.get(h); });
      return floorQuarter((minOf(cols) + maxOf(cols)) / 2);
    }

    var upLeft = this.up(left);
    if (upLeft != null) {
      upLeft.block.shift(groupCentre(left, leftUnits, true) - upLeft.pairMid);
      block.addAll(upLeft.block);
    }
    var upRight = right == null ? null : this.up(right);
    if (upRight != null) {
      upRight.block.shift(groupCentre(right, rightUnits, false) - upRight.pairMid);
      var pushBy = block.overlapShift(upRight.block, FAMILY_GAP);
      upRight.block.shift(pushBy);
      block.addAll(upRight.block);
    }
    return { block: block, pairMid: pairMid };
  };

  Engine.prototype.result = function (focus) {
    var self = this;
    var minLevel = minOf(Array.from(this.level.values()));
    var minCol = minOf(Array.from(this.col.values()));
    function q(col) { return Math.round((col - minCol) * 4); }
    var cells = new Map();
    this.col.forEach(function (value, id) {
      cells.set(id, { quarterColumn: q(value), row: self.level.get(id) - minLevel });
    });
    var order = Array.from(cells.keys()).sort(function (a, b) {
      var byRow = cmpNum(cells.get(a).row, cells.get(b).row);
      if (byRow !== 0) return byRow;
      var byCol = cmpNum(cells.get(a).quarterColumn, cells.get(b).quarterColumn);
      return byCol !== 0 ? byCol : cmpStr(a, b);
    });
    var all = Array.from(cells.values());
    return {
      cells: mapToObject(cells),
      segments: this.segments(cells),
      readingOrder: order,
      rows: maxOf(all.map(function (c) { return c.row; })) + 1,
      quarterColumns: maxOf(all.map(function (c) { return c.quarterColumn; })) + 1,
      focusId: focus,
    };
  };

  Engine.prototype.segments = function (cells) {
    var self = this;
    var segments = [];
    function at(id, anchor) { return point(cells.get(id).quarterColumn, cells.get(id).row, anchor); }

    var partnered = new Set();
    this.edges.forEach(function (edge) {
      if (edge.type === EdgeType.partnerOf) {
        partnered.add(pairKey(edge.person1Id, edge.person2Id));
        segments.push({
          from: at(edge.person1Id, TreeAnchor.avatarCentre),
          to: at(edge.person2Id, TreeAnchor.avatarCentre),
          kind: TreeSegmentKind.partner,
          owners: uniq([edge.person1Id, edge.person2Id]),
        });
      }
    });

    // One bus per set of primary parents and child row.
    var families = new Map(); // "parents|sorted#row" -> {parents, row, children}
    cells.forEach(function (cell, child) {
      var parents = self.primary(child);
      if (parents.length === 0) return;
      var joined = parents.slice().sort(cmpStr).join('|');
      var key = joined + '#' + cell.row;
      var family = families.get(key);
      if (!family) {
        family = { joined: joined, row: cell.row, children: [] };
        families.set(key, family);
      }
      family.children.push(child);
    });
    function leftOfFamily(f) {
      return minOf(f.joined.split('|').map(function (p) { return cells.get(p).quarterColumn; }));
    }
    var keys = Array.from(families.values()).sort(function (a, b) {
      var byRow = cmpNum(a.row, b.row);
      if (byRow !== 0) return byRow;
      var byLeft = cmpNum(leftOfFamily(a), leftOfFamily(b));
      return byLeft !== 0 ? byLeft : cmpStr(a.joined, b.joined);
    });
    // Taken bus spans per child row and level, for staggering.
    var taken = new Map(); // "row#level" -> [[lo, hi]]
    keys.forEach(function (family) {
      var parents = family.joined.split('|');
      var childRow = family.row;
      var children = family.children.sort(function (a, b) {
        return cmpNum(cells.get(a).quarterColumn, cells.get(b).quarterColumn);
      });
      var asPair = parents.length === 2 &&
        partnered.has(pairKey(parents[0], parents[1])) &&
        cells.get(parents[0]).row === cells.get(parents[1]).row;
      var drops;
      if (asPair) {
        var mid = Math.floor((cells.get(parents[0]).quarterColumn + cells.get(parents[1]).quarterColumn) / 2);
        drops = [[point(mid, cells.get(parents[0]).row, TreeAnchor.avatarCentre), mid]];
      } else {
        drops = parents.map(function (parent) {
          return [at(parent, TreeAnchor.nodeBottom), cells.get(parent).quarterColumn];
        });
      }
      var childCols = children.map(function (child) { return cells.get(child).quarterColumn; });
      var dropCols = drops.map(function (d) { return d[1]; });
      var straight = drops.length === 1 && children.length === 1 && dropCols[0] === childCols[0];
      if (straight) {
        segments.push({
          from: drops[0][0],
          to: at(children[0], TreeAnchor.avatarTop),
          kind: TreeSegmentKind.drop,
          owners: uniq(parents.concat([children[0]])),
        });
        return;
      }
      var both = dropCols.concat(childCols);
      var span = [minOf(both), maxOf(both)];
      var level = 0;
      var overlaps = function (s) { return s[0] <= span[1] && span[0] <= s[1]; };
      while ((taken.get(childRow + '#' + level) || []).some(overlaps)) level++;
      push(taken, childRow + '#' + level, span);
      var bus = function (col) { return point(col, childRow, TreeAnchor.bus, level); };
      drops.forEach(function (d) {
        segments.push({ from: d[0], to: bus(d[1]), kind: TreeSegmentKind.drop, owners: uniq(parents) });
      });
      segments.push({ from: bus(span[0]), to: bus(span[1]), kind: TreeSegmentKind.bus, owners: uniq(parents) });
      children.forEach(function (child) {
        segments.push({
          from: bus(cells.get(child).quarterColumn),
          to: at(child, TreeAnchor.avatarTop),
          kind: TreeSegmentKind.drop,
          owners: uniq(parents.concat([child])),
        });
      });
    });

    // Third and later parents: their own bus, a step below the child's.
    this.parentEdges.forEach(function (list, child) {
      list.slice(2).forEach(function (edge) {
        var parent = edge.person1Id;
        var childCell = cells.get(child);
        var extra = function (col) { return point(col, childCell.row, TreeAnchor.extraBus); };
        var owners = uniq([parent, child]);
        segments.push(
          { from: at(parent, TreeAnchor.nodeBottom), to: extra(cells.get(parent).quarterColumn), kind: TreeSegmentKind.extraParent, owners: owners.slice() },
          { from: extra(cells.get(parent).quarterColumn), to: extra(childCell.quarterColumn), kind: TreeSegmentKind.extraParent, owners: owners.slice() },
          { from: extra(childCell.quarterColumn), to: at(child, TreeAnchor.avatarTop), kind: TreeSegmentKind.extraParent, owners: owners.slice() }
        );
      });
    });

    this.edges.forEach(function (edge) {
      if (edge.type === EdgeType.custom) {
        segments.push({
          from: at(edge.person1Id, TreeAnchor.avatarCentre),
          to: at(edge.person2Id, TreeAnchor.avatarCentre),
          kind: TreeSegmentKind.custom,
          owners: uniq([edge.person1Id, edge.person2Id]),
        });
      }
    });
    return segments;
  };

  /**
   * A set of placed people, in slots, with the rows they sit on. Placing one
   * block beside or into another keeps every node a slot clear of the rest.
   */
  function Block(level) {
    this.level = level; // shared with the engine
    this.cols = new Map();
    // The head's living partner, when this block came from a descendant build.
    this.livingPartnerOfHead = null;
  }

  Block.prototype.isEmpty = function () { return this.cols.size === 0; };
  Block.prototype.minAll = function () { return minOf(Array.from(this.cols.values())); };
  Block.prototype.maxAll = function () { return maxOf(Array.from(this.cols.values())); };
  Block.prototype.put = function (id, col) { this.cols.set(id, col); };
  Block.prototype.shift = function (by) {
    var cols = this.cols;
    Array.from(cols.keys()).forEach(function (k) { cols.set(k, cols.get(k) + by); });
  };
  Block.prototype.addAll = function (other) {
    var cols = this.cols;
    other.cols.forEach(function (v, k) { cols.set(k, v); });
  };

  Block.prototype.contour = function () {
    var level = this.level;
    var result = new Map();
    this.cols.forEach(function (value, id) {
      var row = level.get(id);
      var current = result.get(row);
      result.set(row, current == null ? [value, value] : [Math.min(current[0], value), Math.max(current[1], value)]);
    });
    return result;
  };

  /** The shift that puts [other] right of this block by [gap] wherever they share a row; zero when it already is. */
  Block.prototype.overlapShift = function (other, gap) {
    var mine = this.contour();
    var theirs = other.contour();
    var needed = -Infinity;
    theirs.forEach(function (b, row) {
      var a = mine.get(row);
      if (a != null) needed = Math.max(needed, a[1] + gap - b[0]);
    });
    return needed === -Infinity ? 0 : Math.max(0, needed);
  };

  /** Packs [other] against this block's right or left side with [gap], then merges it. */
  Block.prototype.place = function (other, rightOf, gap) {
    if (this.isEmpty()) {
      this.addAll(other);
      return;
    }
    var mine = this.contour();
    var theirs = other.contour();
    var offset = null;
    theirs.forEach(function (b, row) {
      var a = mine.get(row);
      if (a == null) return;
      var needed = rightOf ? a[1] + gap - b[0] : a[0] - gap - b[1];
      offset = offset == null ? needed : (rightOf ? Math.max(offset, needed) : Math.min(offset, needed));
    });
    if (offset == null) offset = rightOf ? this.maxAll() + gap - other.minAll() : this.minAll() - gap - other.maxAll();
    other.shift(offset);
    this.addAll(other);
  };

  Block.prototype.clear = function (other) {
    var level = this.level;
    var byRow = new Map();
    this.cols.forEach(function (v, id) { push(byRow, level.get(id), v); });
    var ok = true;
    other.cols.forEach(function (v, id) {
      if (!ok) return;
      var cols = byRow.get(level.get(id)) || [];
      for (var i = 0; i < cols.length; i++) {
        if (Math.abs(cols[i] - v) < 1 - EPSILON) { ok = false; return; }
      }
    });
    return ok;
  };

  /**
   * Merges [other] at the nearest clear position, trying where it is first,
   * then a quarter slot right, a quarter left, half right, and so on.
   */
  Block.prototype.placeNearest = function (other, onlyLeft, onlyRight) {
    onlyLeft = !!onlyLeft;
    onlyRight = !!onlyRight;
    if (this.isEmpty()) {
      this.addAll(other);
      return;
    }
    var limit = ((this.maxAll() - this.minAll()) + (other.maxAll() - other.minAll()) + 4) * 4;
    for (var step = 0; step <= limit; step++) {
      for (var s = 0; s < 2; s++) {
        var sign = s === 0 ? 1 : -1;
        if (step === 0 && sign === -1) continue;
        if ((onlyLeft && sign === 1 && step > 0) || (onlyRight && sign === -1)) continue;
        var by = sign * step / 4;
        other.shift(by);
        if (this.clear(other)) {
          this.addAll(other);
          return;
        }
        other.shift(-by);
      }
    }
    this.place(other, !onlyLeft, UNIT_GAP);
  };

  /** [personId], their partners, parents and children: who stays at full strength when they are selected. Returns a Set. */
  function closeFamilyOf(personId, edges) {
    var result = new Set([personId]);
    edges.forEach(function (edge) {
      if (edge.type !== EdgeType.custom && edge.person1Id === personId) {
        result.add(edge.person2Id);
      } else if (edge.type !== EdgeType.custom && edge.person2Id === personId) {
        result.add(edge.person1Id);
      }
    });
    return result;
  }

  // ---------------------------------------------------------------------------------------------
  // vertical_layout.dart
  // ---------------------------------------------------------------------------------------------

  /**
   * The indented chart: oldest generation first, each person followed by their
   * partners and then, one indent right, their children. Rules: `tree-layout.md`.
   *
   * layoutVertical({members, edges, standard}) -> VerticalLayout
   *   standard: the TreeLayout from layoutTree for the same members and edges.
   *   VerticalLayout { entries: [{personId, row, indent, top}], links: [{from, to, kind}], depth,
   *                    blocks: [{cards: [personId], indent}] }
   */
  function layoutVertical(args) {
    var members = args.members || [];
    var edges = args.edges || [];
    var standard = args.standard;
    var people = new Map();
    members.forEach(function (member) {
      if (member.status === MemberStatus.active) people.set(member.personId, member);
    });
    var drawn = edges.filter(function (edge) {
      return edge.person1Id !== edge.person2Id && people.has(edge.person1Id) && people.has(edge.person2Id);
    }).sort(function (a, b) { return cmpStr(a.id, b.id); });
    var parents = new Map();
    var children = new Map();
    var partners = new Map();
    var related = new Set();
    function addTo(map, key, value) {
      var set = map.get(key);
      if (!set) { set = new Set(); map.set(key, set); }
      set.add(value);
    }
    drawn.forEach(function (edge) {
      if (edge.type === EdgeType.parentOf) {
        addTo(parents, edge.person2Id, edge.person1Id);
        addTo(children, edge.person1Id, edge.person2Id);
        related.add(edge.person1Id); related.add(edge.person2Id);
      } else if (edge.type === EdgeType.partnerOf) {
        addTo(partners, edge.person1Id, edge.person2Id);
        addTo(partners, edge.person2Id, edge.person1Id);
        related.add(edge.person1Id); related.add(edge.person2Id);
      }
    });

    var reading = new Map();
    standard.readingOrder.forEach(function (id, index) { reading.set(id, index); });
    function byReading(a, b) {
      var ia = reading.has(a) ? reading.get(a) : reading.size;
      var ib = reading.has(b) ? reading.get(b) : reading.size;
      var byIndex = cmpNum(ia, ib);
      return byIndex !== 0 ? byIndex : cmpStr(a, b);
    }
    function byBirth(a, b) { return compareByBirth(people.get(a), people.get(b)); }
    function rowIn(id) {
      var cell = standard.cells[id];
      return cell ? cell.row : 1 << 20;
    }

    // Oldest generation first; members joined only by a custom edge after everyone else.
    var roots = Array.from(people.keys()).filter(function (id) { return !parents.has(id); }).sort(function (a, b) {
      var aLast = !related.has(a);
      var bLast = !related.has(b);
      if (aLast !== bLast) return aLast ? 1 : -1;
      var byRow = cmpNum(rowIn(a), rowIn(b));
      return byRow !== 0 ? byRow : byReading(a, b);
    });

    var entries = [];
    var links = [];
    var blocks = [];
    var rowOf = new Map();
    var depth = 0;

    function place(id, indent) {
      rowOf.set(id, entries.length);
      entries.push({ personId: id, row: entries.length, indent: indent, top: entries.length });
      if (indent > depth) depth = indent;
    }

    function visit(id, indent) {
      place(id, indent);
      var block = [id];
      // A partner's other partners join the block too, so a remarriage stays stacked together.
      for (var i = 0; i < block.length; i++) {
        Array.from(partners.get(block[i]) || []).sort(byReading).forEach(function (partner) {
          if (!rowOf.has(partner)) {
            place(partner, indent);
            links.push({ from: block[block.length - 1], to: partner, kind: VerticalLinkKind.partner });
            block.push(partner);
          }
        });
      }
      blocks.push({ cards: block, indent: indent });
      var nextSet = new Set();
      block.forEach(function (member) { (children.get(member) || []).forEach(function (c) { nextSet.add(c); }); });
      var next = Array.from(nextSet).filter(function (child) { return !rowOf.has(child); }).sort(byBirth);
      next.forEach(function (child) {
        // Taken by an earlier sibling's descendants, as in a cycle of bad data.
        if (rowOf.has(child)) return;
        // The parent nearest the child: the lowest card of the block that is their parent.
        var parent = null;
        for (var j = block.length - 1; j >= 0; j--) {
          var kids = children.get(block[j]);
          if (kids && kids.has(child)) { parent = block[j]; break; }
        }
        links.push({ from: parent, to: child, kind: VerticalLinkKind.child });
        visit(child, indent + 1);
      });
    }

    roots.forEach(function (root) { if (!rowOf.has(root)) visit(root, 0); });
    // A cycle of parents (bad data) leaves people with no root above them.
    Array.from(people.keys()).sort(byReading).forEach(function (id) { if (!rowOf.has(id)) visit(id, 0); });
    return { entries: entries, links: links, depth: depth, blocks: blocks };
  }

  /**
   * Gives each card its top: a block's cards stack down, its first child sits level with the bracket's
   * point, and what comes next starts below whichever ends lower, the block or its children.
   */
  function beside(entries, blocks) {
    // Each block's children, found in one pass: the blocks are in depth-first order, so a block's
    // parent is the latest block one indent to its left.
    var children = blocks.map(function () { return []; });
    var roots = [];
    var latest = new Map();
    blocks.forEach(function (block, index) {
      latest.set(block.indent, index);
      var parent = latest.get(block.indent - 1);
      if (parent != null && block.indent > 0) {
        children[parent].push(index);
      } else {
        roots.push(index);
      }
    });
    var tops = new Map();
    function place(index, top) {
      var block = blocks[index];
      block.cards.forEach(function (card, i) { tops.set(card, top + i); });
      var next = top + (block.cards.length - 1) / 2;
      var end = top + block.cards.length;
      children[index].forEach(function (child) {
        next = place(child, next);
        end = Math.max(end, next);
      });
      return end;
    }
    var next = 0.0;
    roots.forEach(function (r) { next = place(r, next); });
    return entries.map(function (e) {
      return { personId: e.personId, row: e.row, indent: e.indent, top: tops.has(e.personId) ? tops.get(e.personId) : e.row };
    });
  }

  /**
   * The rows a block's branch spans, keyed by the block's first card: from the row under its last
   * card to the row before the next card at its indent or less. Empty for a block with no children.
   * Returns a Map: firstCard -> {start, end}.
   */
  function branchesOf(layout) {
    var rowOf = new Map();
    layout.entries.forEach(function (e) { rowOf.set(e.personId, e.row); });
    var result = new Map();
    layout.blocks.forEach(function (block) {
      var start = rowOf.get(block.cards[block.cards.length - 1]) + 1;
      var end = start;
      while (end < layout.entries.length && layout.entries[end].indent > block.indent) end++;
      result.set(block.cards[0], { start: start, end: end });
    });
    return result;
  }

  /**
   * The cards drawn while only the blocks in [open] show their children: rows closed up, indents
   * kept, and only the links between drawn cards.
   * options.branches: from branchesOf, when the caller already holds them.
   */
  function collapseVertical(full, open, options) {
    var openSet = toSet(open);
    var branches = (options && options.branches) || branchesOf(full);
    var hidden = new Set();
    branches.forEach(function (branch, block) {
      if (!openSet.has(block)) {
        for (var row = branch.start; row < branch.end; row++) hidden.add(row);
      }
    });
    var entries = full.entries.filter(function (entry) { return !hidden.has(entry.row); });
    var shown = new Set(entries.map(function (e) { return e.personId; }));
    var blocks = full.blocks.filter(function (block) { return shown.has(block.cards[0]); });
    return {
      entries: beside(entries.map(function (entry, row) {
        return { personId: entry.personId, row: row, indent: entry.indent, top: entry.top };
      }), blocks),
      links: full.links.filter(function (link) { return shown.has(link.from) && shown.has(link.to); }),
      depth: entries.reduce(function (deepest, e) { return Math.max(deepest, e.indent); }, 0),
      blocks: blocks,
    };
  }

  /** The blocks whose branches hold [personId]: the ones to open for their card to be drawn. Returns a Set. */
  function blocksToward(full, personId, options) {
    var entry = full.entries.find(function (e) { return e.personId === personId; });
    if (!entry) return new Set();
    var row = entry.row;
    var result = new Set();
    ((options && options.branches) || branchesOf(full)).forEach(function (branch, block) {
      if (row >= branch.start && row < branch.end) result.add(block);
    });
    return result;
  }

  /**
   * What opens first: the blocks on the line down to [me] and the block [me] is in, so their
   * parents, siblings, partners and children show. With no card for [me], every root block.
   * Returns a Set.
   */
  function openingBlocks(full, me) {
    var own = me == null ? undefined : full.blocks.find(function (b) { return b.cards.indexOf(me) >= 0; });
    if (!own) {
      return new Set(full.blocks.filter(function (b) { return b.indent === 0; }).map(function (b) { return b.cards[0]; }));
    }
    var result = blocksToward(full, me);
    result.add(own.cards[0]);
    return result;
  }

  /** [open] without [block] and every block inside its branch, so reopening shows one generation. Returns a Set. */
  function closeBranch(full, open, block) {
    var openSet = toSet(open);
    var branch = branchesOf(full).get(block);
    if (!branch) return openSet;
    var rowOf = new Map();
    full.entries.forEach(function (e) { rowOf.set(e.personId, e.row); });
    function inside(key) {
      if (!rowOf.has(key)) return true;
      var row = rowOf.get(key);
      return row >= branch.start && row < branch.end;
    }
    var result = new Set();
    openSet.forEach(function (key) { if (key !== block && !inside(key)) result.add(key); });
    return result;
  }

  // ---------------------------------------------------------------------------------------------
  // relation_gating.dart
  // ---------------------------------------------------------------------------------------------

  var GROUPS = {
    mother: RelationGroup.parents,
    father: RelationGroup.parents,
    partner: RelationGroup.partner,
    brother: RelationGroup.siblings,
    sister: RelationGroup.siblings,
    son: RelationGroup.children,
    daughter: RelationGroup.children,
  };

  /** The group a relation code belongs to; anything not first-degree, or unknown, is "others". */
  function groupOf(code) { return Object.prototype.hasOwnProperty.call(GROUPS, code) ? GROUPS[code] : RelationGroup.others; }

  /** The relation code of a new partner, the one relation a living partner blocks. */
  var partnerCode = 'partner';

  /** Only these parents make siblings, as on the server; guardians and fosters do not. */
  function makesSiblings(q) { return q == null || q === ParentQualifier.biological || q === ParentQualifier.adoptive; }

  /**
   * What the tree already says about the person a member is added beside:
   * their parents, partners, siblings and children among the active members.
   *
   * AnchorFacts.of(anchor: TreeMember, tree: {members, edges}) -> {
   *   anchor, parents, siblingParents, partners, children, siblings   (arrays of TreeMember)
   *   parentsFull, hasParentForSiblings  (booleans), livingPartner (TreeMember or null),
   *   pills (Set of RelationGroup), offered(allRelations), secondParentCandidates(tree),
   *   partnerConflict({relationCode, newPersonDeceased}) }
   */
  function anchorFactsOf(anchor, tree) {
    var byId = new Map();
    tree.members.forEach(function (m) { byId.set(m.personId, m); });
    var id = anchor.personId;
    var parentEdges = tree.edges.filter(function (e) { return e.type === EdgeType.parentOf && e.person2Id === id; });
    var siblingParentIds = uniq(parentEdges.filter(function (e) { return makesSiblings(e.qualifier); })
      .map(function (e) { return e.person1Id; }));
    var siblingParentSet = new Set(siblingParentIds);
    var partnerIds = [];
    tree.edges.forEach(function (e) {
      if (e.type === EdgeType.partnerOf) {
        if (e.person1Id === id) partnerIds.push(e.person2Id);
        else if (e.person2Id === id) partnerIds.push(e.person1Id);
      }
    });
    var siblingIds = uniq(tree.edges.filter(function (e) {
      return e.type === EdgeType.parentOf && makesSiblings(e.qualifier) && siblingParentSet.has(e.person1Id) && e.person2Id !== id;
    }).map(function (e) { return e.person2Id; }));
    function resolve(ids) {
      return ids.filter(function (i) { return byId.has(i); }).map(function (i) { return byId.get(i); });
    }

    var facts = {
      anchor: anchor,
      /** Every parent, guardians and fosters included. */
      parents: resolve(uniq(parentEdges.map(function (e) { return e.person1Id; }))),
      /** The biological and adoptive parents, the ones siblings are derived through. */
      siblingParents: resolve(siblingParentIds),
      /** Partners of any life status. */
      partners: resolve(uniq(partnerIds)),
      children: resolve(uniq(tree.edges.filter(function (e) {
        return e.type === EdgeType.parentOf && e.person1Id === id;
      }).map(function (e) { return e.person2Id; }))),
      siblings: resolve(siblingIds),
    };
    /** Two biological or adoptive parents: no more mothers or fathers are offered. */
    facts.parentsFull = facts.siblingParents.length >= 2;
    facts.hasParentForSiblings = facts.siblingParents.length > 0;
    /** The partner who blocks another living one; an unborn partner counts, as on the server. */
    facts.livingPartner = facts.partners.find(function (p) { return !isDeceased(p); }) || null;
    /** The pills drawn around the anchor: Parents until two, Spouse until a living partner, the rest always. */
    facts.pills = new Set([].concat(
      facts.parentsFull ? [] : [RelationGroup.parents],
      facts.livingPartner == null ? [RelationGroup.partner] : [],
      [RelationGroup.siblings, RelationGroup.children, RelationGroup.others]
    ));
    /**
     * The relations a new member can have to the anchor: no mother or father at two parents, no sibling without a parent.
     * Partner stays beside a living one, because a former partner who has died may still be added.
     */
    facts.offered = function (all) {
      return all.filter(function (r) {
        return !(facts.parentsFull && groupOf(r.code) === RelationGroup.parents) &&
          !(r.requiresAnchorParents && !facts.hasParentForSiblings);
      });
    };
    /**
     * The people who may be a new child's other parent: the anchor's partners,
     * living first, then everyone else active, each by name; never the anchor.
     */
    facts.secondParentCandidates = function (t) {
      function byName(a, b) { return cmpStr(fullName(a).toLowerCase(), fullName(b).toLowerCase()); }
      var ids = new Set(facts.partners.map(function (p) { return p.personId; }));
      var first = facts.partners.slice().sort(function (a, b) {
        var life = (isDeceased(a) ? 1 : 0) - (isDeceased(b) ? 1 : 0);
        return life !== 0 ? life : byName(a, b);
      });
      var rest = t.members.filter(function (m) {
        return !isPending(m) && m.personId !== anchor.personId && !ids.has(m.personId);
      }).sort(byName);
      return first.concat(rest);
    };
    /** The living partner a new living partner would clash with, or null. */
    facts.partnerConflict = function (o) {
      return o.relationCode === partnerCode && !o.newPersonDeceased ? facts.livingPartner : null;
    };
    return facts;
  }

  var AnchorFacts = { of: anchorFactsOf };

  /**
   * The relation in [current]'s group whose implied gender is [gender]: mother for
   * a woman picked as father. Null when none fits, or the gender implies none.
   */
  function relationForGender(current, gender, offered) {
    if (gender === Gender.other || current.impliedGender == null || current.impliedGender === gender) return null;
    return offered.find(function (r) {
      return r.impliedGender === gender &&
        groupOf(r.code) === groupOf(current.code) &&
        r.edgeType === current.edgeType &&
        (r.qualifier == null ? null : r.qualifier) === (current.qualifier == null ? null : current.qualifier) &&
        r.newPersonIsParent === current.newPersonIsParent;
    }) || null;
  }

  /**
   * The partner who would have two living partners if [me] lived again: one
   * partnered to someone else alive, or [me]'s own second living partner.
   */
  function revivalConflict(me, members) {
    var living = anchorFactsOf(me, members).partners.filter(function (p) { return !isDeceased(p); });
    if (living.length > 1) return living[1];
    return living.find(function (p) {
      return anchorFactsOf(p, members).partners.some(function (q) { return !isDeceased(q) && q.personId !== me.personId; });
    }) || null;
  }

  // ---------------------------------------------------------------------------------------------
  // tree_seats.dart
  // ---------------------------------------------------------------------------------------------

  // One slot is four quarter columns; two cells on a row closer than this overlap.
  var SLOT = 4;

  /**
   * The seats around [anchorId] that [facts] leaves open, each beside the people
   * it belongs with, the rest of [layout] moved outward where there is no room.
   *
   * focusLayoutFor({layout, anchorId, facts}) -> { layout: TreeLayout, seats: [TreeSeat] }
   *   TreeSeat { group, cell, lines: [TreeSegment] (owners []), locked }
   *
   * The rules are the "Focus layer" section of `apps/documentation/docs/mobile/tree-layout.md`.
   */
  function focusLayoutFor(args) {
    if (!Object.prototype.hasOwnProperty.call(args.layout.cells, args.anchorId)) {
      return { layout: args.layout, seats: [] };
    }
    return new Focus(args.layout, args.anchorId, args.facts).run();
  }

  function copySegment(s) {
    return { from: Object.assign({}, s.from), to: Object.assign({}, s.to), kind: s.kind, owners: s.owners.slice() };
  }

  function Focus(layout, anchorId, facts) {
    this.layoutIn = layout;
    this.anchorId = anchorId;
    this.facts = facts;
    this.cells = objectToMap(layout.cells);
    this.segs = layout.segments.map(copySegment);
    this.seats = [];
  }

  Focus.prototype.anchor = function () { return this.cells.get(this.anchorId); };

  Focus.prototype.taken = function () {
    return Array.from(this.cells.values()).concat(this.seats.map(function (seat) { return seat.cell; }));
  };

  Focus.prototype.isFree = function (row, column) {
    return !this.taken().some(function (c) { return c.row === row && Math.abs(c.quarterColumn - column) < SLOT; });
  };

  /**
   * Frees [column] on [row] by moving everything there or beyond it, on every row, outward in [direction].
   *
   * The cut runs straight down the tree, so every line stays straight; the lines across it stretch.
   */
  Focus.prototype.makeRoom = function (row, column, direction) {
    function beyond(q) { return direction > 0 ? q > column - SLOT : q < column + SLOT; }
    var inTheWay = this.taken().filter(function (c) {
      return c.row === row && beyond(c.quarterColumn) && Math.abs(c.quarterColumn - column) < SLOT;
    }).map(function (c) { return c.quarterColumn; });
    if (inTheWay.length === 0) return;
    var by = direction > 0 ? column + SLOT - minOf(inTheWay) : maxOf(inTheWay) - column + SLOT;
    function move(q) { return beyond(q) ? q + direction * by : q; }
    function cell(c) { return { quarterColumn: move(c.quarterColumn), row: c.row }; }
    function pt(p) { return { quarterColumn: move(p.quarterColumn), row: p.row, anchor: p.anchor, busLevel: p.busLevel }; }
    function segment(s) { return { from: pt(s.from), to: pt(s.to), kind: s.kind, owners: s.owners }; }
    var cells = this.cells;
    Array.from(cells.keys()).forEach(function (k) { cells.set(k, cell(cells.get(k))); });
    this.segs = this.segs.map(segment);
    this.seats = this.seats.map(function (seat) {
      return { group: seat.group, cell: cell(seat.cell), lines: seat.lines.map(segment), locked: seat.locked };
    });
  };

  // The free column nearest [around] on [row], the left one first at each distance.
  Focus.prototype.nearestFree = function (row, around) {
    var column = around;
    for (var distance = 1; !this.isFree(row, column); distance++) {
      column = this.isFree(row, around - distance) ? around - distance : around + distance;
    }
    return column;
  };

  // A seat at [column] on [row], people moved aside in [direction] when someone is there.
  Focus.prototype.placeAt = function (row, column, direction) {
    this.makeRoom(row, column, direction);
    return { quarterColumn: column, row: row };
  };

  function at(cell, anchor) { return point(cell.quarterColumn, cell.row, anchor); }
  function line(from, to, kind) { return { from: from, to: to, kind: kind, owners: [] }; }

  Focus.prototype.onRow = function (ids, row) {
    var cells = this.cells;
    var out = [];
    ids.forEach(function (id) {
      var cell = cells.get(id);
      if (cell && cell.row === row) out.push(cell);
    });
    return out;
  };

  // The partners of [ids]: a sibling's or a child's spouse belongs to their household.
  Focus.prototype.partnersOf = function (ids) {
    var result = new Set();
    this.segs.forEach(function (s) {
      if (s.kind === TreeSegmentKind.partner && s.owners.some(function (o) { return ids.has(o); })) {
        s.owners.forEach(function (o) { if (!ids.has(o)) result.add(o); });
      }
    });
    return result;
  };

  // The outermost column on [side] of the anchor among [cells]; the anchor's own when none is there.
  Focus.prototype.edge = function (cells, side) {
    var a = this.anchor().quarterColumn;
    return cells.map(function (c) { return c.quarterColumn; })
      .filter(function (q) { return Math.sign(q - a) === side; })
      .reduce(function (acc, b) { return side > 0 ? Math.max(acc, b) : Math.min(acc, b); }, a);
  };

  Focus.prototype.run = function () {
    var self = this;
    var facts = this.facts;
    var siblingIds = new Set(facts.siblings.map(function (m) { return m.personId; }));
    var livingPartner = facts.livingPartner || null;
    var partnerCell = livingPartner == null ? null : (this.cells.get(livingPartner.personId) || null);
    var row = this.anchor().row;

    // Partner: beside the anchor. The focus sits left of their partner; anyone else away from a sibling.
    var partnerSide = partnerCell == null || partnerCell.row !== row
      ? 1
      : Math.sign(partnerCell.quarterColumn - this.anchor().quarterColumn);
    if (livingPartner == null) {
      var siblings = this.onRow(siblingIds, row);
      var siblingLeft = siblings.some(function (c) { return c.quarterColumn < self.anchor().quarterColumn; });
      var siblingRight = siblings.some(function (c) { return c.quarterColumn > self.anchor().quarterColumn; });
      partnerSide = this.anchorId === this.layoutIn.focusId || (siblingLeft && !siblingRight) ? 1 : -1;
      // Someone already beside them there, a deceased partner say, but not on the other side: switch sides.
      var besideCol = this.anchor().quarterColumn + partnerSide * SLOT;
      if (!this.isFree(row, besideCol) && this.isFree(row, this.anchor().quarterColumn - partnerSide * SLOT)) {
        partnerSide = -partnerSide;
      }
      var pcell = this.placeAt(row, this.anchor().quarterColumn + partnerSide * SLOT, partnerSide);
      this.seats.push({
        group: RelationGroup.partner,
        cell: pcell,
        lines: [line(at(this.anchor(), TreeAnchor.avatarCentre), at(pcell, TreeAnchor.avatarCentre), TreeSegmentKind.partner)],
        locked: false,
      });
    }

    // Sibling: away from the partner, past the last sibling's household, on the parents' line.
    var siblingSide = -partnerSide;
    var household = new Set(siblingIds);
    this.partnersOf(siblingIds).forEach(function (p) { household.add(p); });
    household.delete(this.anchorId);
    var siblingCell = this.placeAt(row, this.edge(this.onRow(household, row), siblingSide) + siblingSide * SLOT, siblingSide);
    var locked = !facts.hasParentForSiblings;
    var anchorTop = at(this.anchor(), TreeAnchor.avatarTop);
    var parentDrop = this.segs.find(function (s) {
      return s.kind === TreeSegmentKind.drop && s.from.anchor === TreeAnchor.bus && samePoint(s.to, anchorTop);
    });
    var level = parentDrop ? parentDrop.from.busLevel : 0;
    function siblingBus(q) { return point(q, row, TreeAnchor.bus, level); }
    this.seats.push({
      group: RelationGroup.siblings,
      cell: siblingCell,
      lines: locked ? [] : [
        line(siblingBus(this.anchor().quarterColumn), siblingBus(siblingCell.quarterColumn), TreeSegmentKind.bus),
        line(siblingBus(siblingCell.quarterColumn), at(siblingCell, TreeAnchor.avatarTop), TreeSegmentKind.drop),
      ],
      locked: locked,
    });

    // Parent: the row above, over the anchor or the nearest free slot, left first.
    if (!facts.parentsFull) {
      var above = row - 1;
      var centre = this.anchor().quarterColumn;
      var column = this.nearestFree(above, centre);
      var acell = { quarterColumn: column, row: above };
      var below = function (q) { return point(q, row, TreeAnchor.extraBus); };
      this.seats.push({
        group: RelationGroup.parents,
        cell: acell,
        lines: column === centre
          ? [line(at(acell, TreeAnchor.nodeBottom), at(this.anchor(), TreeAnchor.avatarTop), TreeSegmentKind.drop)]
          : [
            line(at(acell, TreeAnchor.nodeBottom), below(column), TreeSegmentKind.drop),
            line(below(column), below(centre), TreeSegmentKind.bus),
            line(below(centre), at(this.anchor(), TreeAnchor.avatarTop), TreeSegmentKind.drop),
          ],
        locked: false,
      });
    }

    // Child: the row below, past the last child's household on the couple's line, or under the couple with none.
    var childRow = row + 1;
    var childIds = new Set(facts.children.map(function (m) { return m.personId; }));
    var childCell;
    var childLines;
    if (this.onRow(childIds, childRow).length > 0) {
      var childHousehold = new Set(childIds);
      this.partnersOf(childIds).forEach(function (p) { childHousehold.add(p); });
      var edgeCol = maxOf(this.onRow(childHousehold, childRow).map(function (c) { return c.quarterColumn; }));
      childCell = this.placeAt(childRow, edgeCol + SLOT, 1);
      var last = maxOf(this.onRow(childIds, childRow).map(function (c) { return c.quarterColumn; }));
      var lastDrop = this.segs.find(function (s) {
        return s.kind === TreeSegmentKind.drop && s.to.row === childRow && s.to.quarterColumn === last;
      });
      var busLevel = lastDrop && lastDrop.from.anchor === TreeAnchor.bus ? lastDrop.from.busLevel : 0;
      var cbus = function (q) { return point(q, childRow, TreeAnchor.bus, busLevel); };
      childLines = [
        line(cbus(last), cbus(childCell.quarterColumn), TreeSegmentKind.bus),
        line(cbus(childCell.quarterColumn), at(childCell, TreeAnchor.avatarTop), TreeSegmentKind.drop),
      ];
    } else {
      var partner = livingPartner == null ? null : (this.cells.get(livingPartner.personId) || null);
      var from = partner != null && partner.row === row
        ? point(Math.floor((this.anchor().quarterColumn + partner.quarterColumn) / 2), row, TreeAnchor.avatarCentre)
        : at(this.anchor(), TreeAnchor.nodeBottom);
      // A cut here would move the anchor too, so the seat takes the nearest free slot instead.
      childCell = { quarterColumn: this.nearestFree(childRow, from.quarterColumn), row: childRow };
      var bus0 = function (q) { return point(q, childRow, TreeAnchor.bus); };
      childLines = childCell.quarterColumn === from.quarterColumn
        ? [line(from, at(childCell, TreeAnchor.avatarTop), TreeSegmentKind.drop)]
        : [
          line(from, bus0(from.quarterColumn), TreeSegmentKind.drop),
          line(bus0(from.quarterColumn), bus0(childCell.quarterColumn), TreeSegmentKind.bus),
          line(bus0(childCell.quarterColumn), at(childCell, TreeAnchor.avatarTop), TreeSegmentKind.drop),
        ];
    }
    this.seats.push({ group: RelationGroup.children, cell: childCell, lines: childLines, locked: false });

    // Other: beside the Child seat, with no line, since it may be anyone.
    var child = this.seats.find(function (s) { return s.group === RelationGroup.children; }).cell;
    var otherCell = this.placeAt(childRow, child.quarterColumn + SLOT, 1);
    this.seats.push({ group: RelationGroup.others, cell: otherCell, lines: [], locked: false });

    var moved = {
      cells: mapToObject(this.cells),
      segments: this.segs,
      readingOrder: this.layoutIn.readingOrder,
      rows: this.layoutIn.rows,
      quarterColumns: maxOf(Array.from(this.cells.values()).map(function (c) { return c.quarterColumn; })) + 1,
      focusId: this.layoutIn.focusId,
    };
    // The order a screen reader reads them in.
    var seats = this.seats.slice().sort(function (a, b) {
      return cmpNum(RELATION_GROUPS.indexOf(a.group), RELATION_GROUPS.indexOf(b.group));
    });
    return { layout: moved, seats: seats };
  };

  // ---------------------------------------------------------------------------------------------

  var OhanaEngine = {
    // tree_layout.dart
    layoutTree: layoutTree,
    closeFamilyOf: closeFamilyOf,
    TreeAnchor: TreeAnchor,
    TreeSegmentKind: TreeSegmentKind,
    // vertical_layout.dart
    layoutVertical: layoutVertical,
    branchesOf: branchesOf,
    collapseVertical: collapseVertical,
    blocksToward: blocksToward,
    openingBlocks: openingBlocks,
    closeBranch: closeBranch,
    TreeArrangement: TreeArrangement,
    VerticalLinkKind: VerticalLinkKind,
    // tree_seats.dart
    focusLayoutFor: focusLayoutFor,
    // relation_gating.dart
    AnchorFacts: AnchorFacts,
    anchorFactsOf: anchorFactsOf,
    RelationGroup: RelationGroup,
    groupOf: groupOf,
    partnerCode: partnerCode,
    relationForGender: relationForGender,
    revivalConflict: revivalConflict,
    // member_order.dart
    orderMembers: orderMembers,
    compareByBirth: compareByBirth,
    // tree_member.dart
    Gender: Gender,
    LifeStatus: LifeStatus,
    BirthPrecision: BirthPrecision,
    MemberStatus: MemberStatus,
    AccessLevel: AccessLevel,
    RelationBucket: RelationBucket,
    EdgeType: EdgeType,
    ParentQualifier: ParentQualifier,
    fullName: fullName,
    isDeceased: isDeceased,
    isPending: isPending,
  };

  root.OhanaEngine = OhanaEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = OhanaEngine;
})(typeof window !== 'undefined' ? window : globalThis);
