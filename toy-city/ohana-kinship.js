/*
 * ohana-kinship.js
 *
 * The My Ohana kinship derivation, ported from the NestJS backend (English only):
 *
 *   apps/backend/src/relationships/kinship-path-finder.ts          the walk (findRoutes, enumerate, buildAdjacency)
 *   apps/backend/src/relationships/kinship-shape.ts                bucketFor, parentsOf, sharedParents, counters
 *   apps/backend/src/relationships/kinship-descriptor.ts           describeKinship (shape -> relation + facets)
 *   apps/backend/src/relationships/catalogue-kinship-word-namer.ts the facet ladder, cousins, path words
 *   apps/backend/src/relationships/words/en.json                   the English words
 *   apps/backend/src/relationships/kinship.service.ts              deriveFromGraph (primary path, D62 tier)
 *
 * Nothing is stored as a word. Input is the graph the server caches:
 *
 *   graph = { persons: { [id]: { id, gender: 'male'|'female'|'other', lifeStatus, transit? } },
 *             edges: [ { type: 'parent_of'|'partner_of'|'custom', person1Id, person2Id,
 *                        qualifier: 'biological'|'adoptive'|'guardian'|'foster'|null,
 *                        customRole: 'godparent'|'chosen_sibling'|'chosen_family'|null,
 *                        customLabel: string|null } ] }
 *
 * parent_of: person1 is the parent. partner_of: undirected. custom: person1 is the role's subject.
 *
 * A plain script like ohana-engine.js: defines window.OhanaKinship (globalThis in Node, and
 * module.exports for require()).
 */
(function (root) {
  'use strict';

  var MAX_DEPTH = 6;
  var MAX_TERMINAL_PREFIX = 2;
  var MAX_PATHS_PER_TARGET = 8;
  var CUSTOM_ROLE_RELATIONS = {
    godparent: { subject: 'godparent', object: 'godchild' },
    chosen_sibling: { subject: 'chosen_sibling', object: 'chosen_sibling' },
    chosen_family: { subject: 'chosen_family', object: 'chosen_family' },
  };

  // relationships.repository.ts: guardian and foster end a path; adoptive does not.
  function isTerminalQualifier(q) {
    return q === 'guardian' || q === 'foster';
  }

  /* ---------------- kinship-path-finder.ts ---------------- */

  function buildAdjacency(graph) {
    var adjacency = new Map();
    function add(from, n) {
      if (!graph.persons[from] || !graph.persons[n.personId]) return;
      var list = adjacency.get(from);
      if (list) list.push(n);
      else adjacency.set(from, [n]);
    }
    graph.edges.forEach(function (edge) {
      switch (edge.type) {
        case 'parent_of':
          add(edge.person2Id, { personId: edge.person1Id, direction: 'U', qualifier: edge.qualifier || 'biological', customRelation: null, customLabel: null });
          add(edge.person1Id, { personId: edge.person2Id, direction: 'D', qualifier: edge.qualifier || 'biological', customRelation: null, customLabel: null });
          break;
        case 'partner_of':
          add(edge.person1Id, { personId: edge.person2Id, direction: 'P', qualifier: null, customRelation: null, customLabel: null });
          add(edge.person2Id, { personId: edge.person1Id, direction: 'P', qualifier: null, customRelation: null, customLabel: null });
          break;
        case 'custom': {
          var roles = edge.customRole ? CUSTOM_ROLE_RELATIONS[edge.customRole] : null;
          add(edge.person2Id, { personId: edge.person1Id, direction: 'C', qualifier: null, customRelation: roles ? roles.subject : null, customLabel: edge.customLabel == null ? null : edge.customLabel });
          add(edge.person1Id, { personId: edge.person2Id, direction: 'C', qualifier: null, customRelation: roles ? roles.object : null, customLabel: edge.customLabel == null ? null : edge.customLabel });
          break;
        }
        default:
          break;
      }
    });
    return adjacency;
  }

  function toPath(targetId, steps) {
    var idx = steps.findIndex(function (s) { return s.direction === 'C' || isTerminalQualifier(s.qualifier); });
    return {
      targetId: targetId,
      steps: steps,
      shape: steps.map(function (s) { return s.direction; }).join(''),
      terminalStepIndex: idx === -1 ? null : idx,
    };
  }

  function enumerate(targetId, viewerId, arrivalPreds, expansionPreds) {
    var paths = [];
    function walk(personId, suffix, first) {
      if (paths.length >= MAX_PATHS_PER_TARGET) return;
      if (personId === viewerId) { paths.push(toPath(targetId, suffix)); return; }
      var preds = first ? arrivalPreds.get(personId) : expansionPreds.get(personId);
      (preds || []).forEach(function (pred) { walk(pred.fromId, [pred.step].concat(suffix), false); });
    }
    walk(targetId, [], true);
    // Routes that avoid a terminal edge are preferred as the primary path (stable sort).
    return paths.sort(function (a, b) { return Number(a.terminalStepIndex !== null) - Number(b.terminalStepIndex !== null); });
  }

  /**
   * The walk in both tiers (D62). `real` is every shortest route; `terminal` holds routes whose
   * last step crosses a guardian, foster or custom edge from someone other than the viewer.
   * `trace` (not in the backend) lists people in the order the queue expanded them, with depth,
   * so the page can draw the frontier.
   */
  function findRoutes(graph, viewerId) {
    var result = { real: new Map(), terminal: new Map(), trace: [] };
    if (!graph.persons[viewerId]) return result;
    var adjacency = buildAdjacency(graph);

    var arrival = new Map([[viewerId, 0]]);
    var arrivalPreds = new Map();
    var expansion = new Map([[viewerId, 0]]);
    var expansionPreds = new Map();
    var terminalArrival = new Map();
    var terminalPreds = new Map();
    var queue = [viewerId];

    while (queue.length > 0) {
      var current = queue.shift();
      var currentDistance = expansion.get(current) || 0;
      result.trace.push({ id: current, depth: currentDistance });
      if (currentDistance >= MAX_DEPTH) continue;

      var list = adjacency.get(current) || [];
      for (var i = 0; i < list.length; i++) {
        var neighbour = list[i];
        if (neighbour.personId === viewerId) continue;
        var step = {
          direction: neighbour.direction,
          personId: neighbour.personId,
          qualifier: neighbour.qualifier,
          customRelation: neighbour.customRelation,
          customLabel: neighbour.customLabel,
        };
        var next = currentDistance + 1;
        var terminal = neighbour.direction === 'C' || isTerminalQualifier(neighbour.qualifier);

        if (terminal) {
          if (currentDistance <= MAX_TERMINAL_PREFIX) {
            var known = terminalArrival.get(neighbour.personId);
            if (known === undefined || known > next) {
              terminalArrival.set(neighbour.personId, next);
              terminalPreds.set(neighbour.personId, [{ fromId: current, step: step }]);
            } else if (known === next) {
              terminalPreds.get(neighbour.personId).push({ fromId: current, step: step });
            }
          }
          if (current !== viewerId) continue;
        }

        var expandable = !terminal;
        var knownArrival = arrival.get(neighbour.personId);
        if (knownArrival === undefined || knownArrival > next) {
          arrival.set(neighbour.personId, next);
          arrivalPreds.set(neighbour.personId, [{ fromId: current, step: step }]);
        } else if (knownArrival === next) {
          arrivalPreds.get(neighbour.personId).push({ fromId: current, step: step });
        }

        if (!expandable) continue;
        var knownExpansion = expansion.get(neighbour.personId);
        if (knownExpansion === undefined) {
          expansion.set(neighbour.personId, next);
          expansionPreds.set(neighbour.personId, [{ fromId: current, step: step }]);
          queue.push(neighbour.personId);
        } else if (knownExpansion === next) {
          expansionPreds.get(neighbour.personId).push({ fromId: current, step: step });
        }
      }
    }

    function collect(distances, preds, into) {
      distances.forEach(function (_, targetId) {
        if (targetId === viewerId) return;
        var p = graph.persons[targetId];
        if (p && p.transit) return; // D47: a removed member is a road, not a destination
        var paths = enumerate(targetId, viewerId, preds, expansionPreds);
        if (paths.length > 0) into.set(targetId, paths);
      });
    }
    collect(arrival, arrivalPreds, result.real);
    collect(terminalArrival, terminalPreds, result.terminal);
    return result;
  }

  function findAll(graph, viewerId) { return findRoutes(graph, viewerId).real; }
  function findBetween(graph, viewerId, targetId) { return findAll(graph, viewerId).get(targetId) || []; }

  /* ---------------- kinship-shape.ts ---------------- */

  function bucketFor(path) {
    if (path.terminalStepIndex !== null) return 'extended';
    switch (path.shape) {
      case 'P': return 'spouse';
      case 'D': return 'child';
      case 'U': return 'parent';
      case 'UD': return 'sibling';
      case 'UU': return 'grandparent';
      default: return 'extended';
    }
  }

  function parentsOf(graph, personId) {
    var parents = new Set();
    graph.edges.forEach(function (e) {
      if (e.type === 'parent_of' && e.person2Id === personId && !isTerminalQualifier(e.qualifier) && graph.persons[e.person1Id] !== undefined) parents.add(e.person1Id);
    });
    return parents;
  }

  function sharedParents(graph, a, b) {
    var pa = parentsOf(graph, a), shared = 0;
    parentsOf(graph, b).forEach(function (p) { if (pa.has(p)) shared += 1; });
    return shared;
  }

  function countLeading(shape, letter) { var n = 0; while (n < shape.length && shape[n] === letter) n += 1; return n; }
  function countTrailing(shape, letter) { var n = 0; while (n < shape.length && shape[shape.length - 1 - n] === letter) n += 1; return n; }

  /* ---------------- kinship-descriptor.ts ---------------- */

  var KINSHIP_RELATIONS = ['parent', 'child', 'partner', 'guardian', 'ward', 'foster_parent', 'foster_child', 'godparent', 'godchild', 'chosen_sibling', 'chosen_family', 'custom', 'relative', 'ancestor', 'descendant', 'sibling', 'parent_sibling', 'parent_sibling_partner', 'grandparent_sibling', 'sibling_child', 'sibling_grandchild', 'partner_sibling_child', 'cousin', 'parent_in_law', 'child_in_law', 'partner_sibling', 'sibling_partner', 'partner_sibling_partner'];
  var KINSHIP_FACETS = ['paternal', 'maternal', 'via_son', 'via_daughter', 'via_brother', 'via_sister', 'via_uncle', 'via_aunt', 'of_uncle', 'of_aunt', 'of_grandfather', 'of_grandmother', 'viewer_male', 'viewer_female', 'half', 'step', 'adoptive', 'deceased', 'distant'];

  function oneStep(step, gender, deceased) {
    function of(relation, facets) { return { relation: relation, facets: facets || [], gender: gender }; }
    switch (step.direction) {
      case 'U':
        if (step.qualifier === 'guardian') return of('guardian');
        if (step.qualifier === 'foster') return of('foster_parent');
        return of('parent');
      case 'D':
        if (step.qualifier === 'guardian') return of('ward');
        if (step.qualifier === 'foster') return of('foster_child');
        return of('child');
      case 'P':
        return of('partner', deceased ? ['deceased'] : []);
      case 'C': {
        if (step.customRelation) return of(step.customRelation);
        var d = of('custom');
        d.literal = step.customLabel == null ? undefined : step.customLabel;
        return d;
      }
      default:
        return null;
    }
  }

  function side(gender) { return gender === 'male' ? ['paternal'] : gender === 'female' ? ['maternal'] : []; }
  function via(gender, male, female) { return gender === 'male' ? [male] : gender === 'female' ? [female] : []; }
  function viewerFacet(gender) { return via(gender, 'viewer_male', 'viewer_female'); }
  function assign(a, b) { return Object.assign({}, a, b); }

  function describeKinship(path, graph, viewerId) {
    function genderOf(id) { var p = id ? graph.persons[id] : undefined; return (p && p.gender) || 'other'; }
    var target = graph.persons[path.targetId];
    var gender = (target && target.gender) || 'other';
    var deceased = !!target && target.lifeStatus === 'deceased';
    var steps = path.steps, shape = path.shape, first = steps[0];
    function of(relation, facets) { return { relation: relation, facets: facets || [], gender: gender }; }
    function pid(i) { return steps[i] ? steps[i].personId : undefined; }

    if (steps.length === 1 && first) {
      var single = oneStep(first, gender, deceased);
      if (single) return single;
    }

    var terminalIndex = path.terminalStepIndex;
    if (terminalIndex !== null) {
      var terminalStep = steps[terminalIndex];
      var composable = terminalStep !== undefined && terminalIndex === steps.length - 1 && terminalIndex >= 1 && terminalIndex <= MAX_TERMINAL_PREFIX;
      if (!composable) return of('relative');
      var terminal = oneStep(terminalStep, gender, deceased);
      if (!terminal) return of('relative');
      var prefixSteps = steps.slice(0, -1);
      var prefixTarget = prefixSteps.length ? prefixSteps[prefixSteps.length - 1].personId : undefined;
      if (!prefixTarget) return of('relative');
      var prefix = describeKinship({ targetId: prefixTarget, steps: prefixSteps, shape: shape.slice(0, -1), terminalStepIndex: null }, graph, viewerId);
      if (prefix.relation === 'relative') return of('relative');
      return assign(terminal, { composed: { prefix: prefix, terminal: terminal } });
    }

    var ups = countLeading(shape, 'U');
    var downs = countTrailing(shape, 'D');
    var parentSide = side(genderOf(pid(0)));

    if (shape === 'U'.repeat(steps.length)) {
      return assign(of('ancestor', side(genderOf(pid(steps.length - 2)))), { depth: steps.length });
    }
    if (shape === 'D'.repeat(steps.length)) {
      return assign(of('descendant', via(genderOf(pid(steps.length - 2)), 'via_son', 'via_daughter')), { depth: steps.length });
    }

    if (shape === 'UD') {
      var shared = sharedParents(graph, viewerId, path.targetId);
      return of('sibling', shared >= 2 ? [] : ['half']);
    }
    if (shape === 'UPD') return of('sibling', ['step']);

    if (shape === 'UP') return of('parent', ['step']);
    if (shape === 'PD') return of('child', ['step']);
    if (shape === 'UUP') return assign(of('ancestor', parentSide.concat(['step'])), { depth: 2 });

    if (shape === 'UUD') {
      var parentId = pid(0);
      var sh = parentId ? sharedParents(graph, parentId, path.targetId) : 2;
      return of('parent_sibling', sh === 1 ? parentSide.concat(['half']) : parentSide);
    }
    if (shape === 'UUDP') return of('parent_sibling_partner', parentSide.concat(via(genderOf(pid(2)), 'of_uncle', 'of_aunt')));
    if (shape === 'UUUD') return of('grandparent_sibling', parentSide.concat(via(genderOf(pid(1)), 'of_grandfather', 'of_grandmother')));

    if (shape === 'UDD') return of('sibling_child', via(genderOf(pid(1)), 'via_brother', 'via_sister'));
    if (shape === 'UDDD') return of('sibling_grandchild', via(genderOf(pid(1)), 'via_brother', 'via_sister'));
    if (shape === 'PUDD') return of('partner_sibling_child', via(genderOf(pid(2)), 'via_brother', 'via_sister'));

    if (ups >= 2 && downs >= 2 && ups + downs === steps.length) {
      var degree = Math.min(ups, downs) - 1;
      var removed = Math.abs(ups - downs);
      var facets = degree === 1 && removed === 0 ? parentSide.concat(via(genderOf(pid(ups)), 'via_uncle', 'via_aunt')) : ['distant'];
      return assign(of('cousin', facets), { cousin: { degree: degree, removed: removed } });
    }

    if (shape === 'PU') return of('parent_in_law');
    if (shape === 'DP') return of('child_in_law');
    if (shape === 'PUD') return of('partner_sibling', viewerFacet(genderOf(viewerId)));
    if (shape === 'UDP') return of('sibling_partner', via(genderOf(pid(1)), 'via_brother', 'via_sister'));
    if (shape === 'PUDP') return of('partner_sibling_partner', viewerFacet(genderOf(viewerId)));

    return of('relative');
  }

  /* ---------------- words/en.json ---------------- */

  var EN = {
    words: {
      'parent.male': 'father', 'parent.female': 'mother', 'parent.other': 'parent',
      'parent.step.male': 'step-father', 'parent.step.female': 'step-mother', 'parent.step.other': 'step-parent',
      'child.male': 'son', 'child.female': 'daughter', 'child.other': 'child',
      'child.step.male': 'step-son', 'child.step.female': 'step-daughter', 'child.step.other': 'step-child',
      'child.adoptive.male': 'adopted son', 'child.adoptive.female': 'adopted daughter', 'child.adoptive.other': 'adopted child',
      'partner.male': 'husband', 'partner.female': 'wife', 'partner.other': 'partner',
      'partner.deceased.male': 'late husband', 'partner.deceased.female': 'late wife', 'partner.deceased.other': 'late partner',
      'guardian': 'guardian', 'ward': 'ward',
      'foster_parent.male': 'foster father', 'foster_parent.female': 'foster mother', 'foster_parent.other': 'foster parent',
      'foster_child.male': 'foster son', 'foster_child.female': 'foster daughter', 'foster_child.other': 'foster child',
      'godparent.male': 'godfather', 'godparent.female': 'godmother', 'godparent.other': 'godparent',
      'godchild.male': 'godson', 'godchild.female': 'goddaughter', 'godchild.other': 'godchild',
      'chosen_sibling.male': 'chosen brother', 'chosen_sibling.female': 'chosen sister', 'chosen_sibling.other': 'chosen sibling',
      'chosen_family.other': 'chosen family',
      'custom.other': 'someone else',
      'relative': 'relative',
      'ancestor.male': 'grandfather', 'ancestor.female': 'grandmother', 'ancestor.other': 'grandparent',
      'ancestor.step.male': 'step-grandfather', 'ancestor.step.female': 'step-grandmother', 'ancestor.step.other': 'step-grandparent',
      'affix.ancestor': 'great-',
      'descendant.male': 'grandson', 'descendant.female': 'granddaughter', 'descendant.other': 'grandchild',
      'affix.descendant': 'great-',
      'sibling.male': 'brother', 'sibling.female': 'sister', 'sibling.other': 'sibling',
      'sibling.half.male': 'half-brother', 'sibling.half.female': 'half-sister', 'sibling.half.other': 'half-sibling',
      'sibling.step.male': 'step-brother', 'sibling.step.female': 'step-sister', 'sibling.step.other': 'step-sibling',
      'parent_sibling.male': 'uncle', 'parent_sibling.female': 'aunt', 'parent_sibling.other': "parent's sibling",
      'parent_sibling.half.male': 'half-uncle', 'parent_sibling.half.female': 'half-aunt', 'parent_sibling.half.other': "half-parent's sibling",
      'parent_sibling_partner.male': 'uncle', 'parent_sibling_partner.female': 'aunt', 'parent_sibling_partner.other': "parent's sibling's partner",
      'grandparent_sibling.male': 'great-uncle', 'grandparent_sibling.female': 'great-aunt', 'grandparent_sibling.other': "grandparent's sibling",
      'sibling_child.male': 'nephew', 'sibling_child.female': 'niece', 'sibling_child.other': "sibling's child",
      'sibling_grandchild.male': 'great-nephew', 'sibling_grandchild.female': 'great-niece', 'sibling_grandchild.other': "sibling's grandchild",
      'partner_sibling_child.male': 'nephew', 'partner_sibling_child.female': 'niece', 'partner_sibling_child.other': "partner's sibling's child",
      'cousin.template': '{{ordinal}} cousin {{removed}}',
      'cousin.ordinal.1': 'first', 'cousin.ordinal.2': 'second', 'cousin.ordinal.3': 'third', 'cousin.ordinal.4': 'fourth', 'cousin.ordinal.5': 'fifth',
      'cousin.removed.1': 'once removed', 'cousin.removed.2': 'twice removed', 'cousin.removed.3': 'three times removed', 'cousin.removed.4': 'four times removed',
      'parent_in_law.male': 'father-in-law', 'parent_in_law.female': 'mother-in-law', 'parent_in_law.other': 'parent-in-law',
      'child_in_law.male': 'son-in-law', 'child_in_law.female': 'daughter-in-law', 'child_in_law.other': 'child-in-law',
      'partner_sibling.male': 'brother-in-law', 'partner_sibling.female': 'sister-in-law', 'partner_sibling.other': 'sibling-in-law',
      'sibling_partner.male': 'brother-in-law', 'sibling_partner.female': 'sister-in-law', 'sibling_partner.other': 'sibling-in-law',
      'partner_sibling_partner.male': 'brother-in-law', 'partner_sibling_partner.female': 'sister-in-law', 'partner_sibling_partner.other': 'sibling-in-law',
    },
    grammar: { you: 'you', lead: { m: 'your ', f: 'your ' }, join: { m: "'s ", f: "'s " } },
  };

  /* ---------------- catalogue-kinship-word-namer.ts (en) ---------------- */

  function subsets(facets) {
    var all = [];
    for (var mask = (1 << facets.length) - 1; mask >= 0; mask -= 1) {
      all.push(facets.filter(function (_, index) { return (mask & (1 << index)) !== 0; }));
    }
    return all.sort(function (a, b) { return b.length - a.length; });
  }

  function resolve(relation, facets, gender) {
    var words = EN.words, subs = subsets(facets), i;
    for (i = 0; i < subs.length; i++) {
      var g = words[[relation].concat(subs[i]).join('.') + '.' + gender];
      if (g) return g;
    }
    for (i = 0; i < subs.length; i++) {
      var plain = words[[relation].concat(subs[i]).join('.')];
      if (plain) return plain;
    }
    return null;
  }
  function lookup(relation, facets, gender) { var r = resolve(relation, facets, gender); return r == null ? relation : r; }

  function joinPossessive(parts, withLead) {
    var grammar = EN.grammar, feminine = new Set(grammar.feminine || []);
    function genderOfWord(w) { return feminine.has(w) ? 'f' : 'm'; }
    var head = parts[0];
    if (head === undefined) return '';
    var lead = withLead ? ((grammar.lead && (grammar.lead[genderOfWord(head)] || grammar.lead.m)) || 'your ') : '';
    var out = lead + head;
    for (var index = 1; index < parts.length; index += 1) {
      var current = parts[index], previous = parts[index - 1];
      if (current === undefined || previous === undefined) continue;
      var inflected = (grammar.oblique && grammar.oblique[previous]) || previous;
      out = out.slice(0, out.length - previous.length) + inflected;
      out += ((grammar.join && grammar.join[genderOfWord(current)]) || "'s ") + current;
    }
    return out;
  }

  function stepWord(step, graph) {
    var p = graph.persons[step.personId], gender = (p && p.gender) || 'other';
    switch (step.direction) {
      case 'U':
        if (step.qualifier === 'guardian') return lookup('guardian', [], gender);
        if (step.qualifier === 'foster') return lookup('foster_parent', [], gender);
        return lookup('parent', [], gender);
      case 'D':
        if (step.qualifier === 'guardian') return lookup('ward', [], gender);
        if (step.qualifier === 'foster') return lookup('foster_child', [], gender);
        return lookup('child', [], gender);
      case 'P':
        return lookup('partner', [], gender);
      case 'C':
        if (step.customRelation) return lookup(step.customRelation, [], gender);
        return step.customLabel != null ? step.customLabel : lookup('relative', [], gender);
      default:
        return lookup('relative', [], gender);
    }
  }

  function plainWords(path, graph) {
    var parts = path.steps.map(function (s) { return stepWord(s, graph); });
    if (!parts[0]) return EN.grammar.you || 'you';
    return joinPossessive(parts, true);
  }

  function buildCousin(d) {
    var c = d.cousin, template = EN.words['cousin.template'];
    if (!c || !template) return null;
    var ordinal = EN.words['cousin.ordinal.' + c.degree] || c.degree + 'th';
    var removed = c.removed === 0 ? '' : EN.words['cousin.removed.' + c.removed] || '';
    return template.replace('{{ordinal}}', ordinal).replace('{{removed}}', removed).replace(/\s+/g, ' ').trim();
  }

  function wordFor(d) {
    if (d.composed) return joinPossessive([wordFor(d.composed.prefix), wordFor(d.composed.terminal)], false);
    if (d.relation === 'custom' && d.literal) return d.literal;
    var direct = resolve(d.relation, d.facets, d.gender);
    if (direct && d.depth && d.depth > 2) {
      var affix = EN.words['affix.' + d.relation + '.' + d.gender] || EN.words['affix.' + d.relation] || '';
      return affix.repeat(d.depth - 2) + direct;
    }
    if (direct) return direct;
    if (d.cousin) { var built = buildCousin(d); if (built) return built; }
    return lookup('relative', [], d.gender);
  }

  function name(path, graph, viewerId) {
    var d = describeKinship(path, graph, viewerId);
    return { word: wordFor(d), relation: d.relation, bucket: bucketFor(path), pathWords: plainWords(path, graph), descriptor: d };
  }

  /* ---------------- kinship.service.ts deriveFromGraph ---------------- */

  function deriveFromGraph(graph, viewerId) {
    var results = new Map();
    var routes = findRoutes(graph, viewerId);
    routes.real.forEach(function (paths, targetId) {
      var primary = paths[0];
      if (!primary) return;
      var named = name(primary, graph, viewerId);
      var alternatives = paths.slice(1).map(function (p) { return name(p, graph, viewerId).word; }).filter(function (w) { return w !== named.word; });
      results.set(targetId, { word: named.word, relation: named.relation, path: primary.shape, pathWords: named.pathWords, bucket: named.bucket, alternatives: Array.from(new Set(alternatives)), primary: primary, paths: paths });
    });
    routes.terminal.forEach(function (paths, targetId) {
      var primary = paths[0];
      if (!primary) return;
      var existing = results.get(targetId);
      if (existing && existing.relation !== 'relative') return;
      var named = name(primary, graph, viewerId);
      if (named.relation === 'relative') return;
      results.set(targetId, { word: named.word, relation: named.relation, path: primary.shape, pathWords: named.pathWords, bucket: named.bucket, alternatives: existing ? existing.alternatives : [], primary: primary, paths: paths });
    });
    return results;
  }

  var OhanaKinship = {
    MAX_DEPTH: MAX_DEPTH,
    MAX_TERMINAL_PREFIX: MAX_TERMINAL_PREFIX,
    KINSHIP_RELATIONS: KINSHIP_RELATIONS,
    KINSHIP_FACETS: KINSHIP_FACETS,
    words: EN,
    isTerminalQualifier: isTerminalQualifier,
    findRoutes: findRoutes,
    findAll: findAll,
    findBetween: findBetween,
    bucketFor: bucketFor,
    parentsOf: parentsOf,
    sharedParents: sharedParents,
    describeKinship: describeKinship,
    name: name,
    plainWords: plainWords,
    deriveFromGraph: deriveFromGraph,
  };

  root.OhanaKinship = OhanaKinship;
  if (typeof module !== 'undefined' && module.exports) module.exports = OhanaKinship;
})(typeof window !== 'undefined' ? window : globalThis);
