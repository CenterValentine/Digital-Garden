/* garden-data.js — content for davidvalentine.org.
   Category -> leaf (each item = a vein). Item -> DNA (each sub = a rung/base pair). */
function S(){var a=[];for(var i=0;i<arguments.length;i+=2)a.push({title:arguments[i],note:arguments[i+1]});return a;}
window.CATS = {
  projects: { label:'Projects', title:'Projects', kind:'shoot',
    intro:'Tools I\u2019ve grown \u2014 mostly for thinking, mostly local-first. Each vein is one project.',
    items:[
      {title:'Digital Garden', meta:'IDE \u00b7 2021\u2013now', blurb:'An Obsidian-inspired IDE for thinking: bidirectional links, plain-text, local-first.',
        sub:S('Editor core','plain-text, keyboard-first','Link graph','backlinks & maps','Plugin API','extend everything','Local sync','offline by default','Themes','day & night')},
      {title:'Terrarium', meta:'sync \u00b7 2023', blurb:'A CRDT layer that keeps a garden consistent across devices, offline-first.',
        sub:S('CRDT core','mergeable state','Conflict UI','resolve gently','Transport','p2p + relay','Snapshots','time travel')},
      {title:'Espalier', meta:'framework \u00b7 2022', blurb:'A tiny layout system trained along constraints, like fruit on a trellis.',
        sub:S('Grid primitives','constraints first','Design tokens','one source','Live docs','copy-paste ready')},
      {title:'Almanac', meta:'tool \u00b7 2020', blurb:'A seasonal journal that resurfaces old notes when they\u2019re ripe again.',
        sub:S('Seasonal resurfacing','ripe notes return','Daily pages','one per day','Plain export','markdown out')},
      {title:'Loom', meta:'library \u00b7 2019', blurb:'A bidirectional-link parser that turns plain text into a navigable graph.',
        sub:S('Wiki parser','[[links]]','Graph model','nodes & edges','HTML renderer','static out')}
    ]},
  writing: { label:'Writing', title:'Writing', kind:'shoot',
    intro:'Long essays on slow software and the craft of thinking. Trace a vein to read.',
    items:[
      {title:'Gardening, not architecting', meta:'essay \u00b7 18 min', blurb:'Why software grown beats software planned.',
        sub:S('The blueprint trap','plans rot','Growth over plans','tend, don\u2019t spec','Tending as practice','daily care')},
      {title:'The slow web', meta:'essay \u00b7 12 min', blurb:'In praise of pages that wait for you.',
        sub:S('Pages that wait','no autoplay','Against urgency','reclaim time','Reading first','words over widgets')},
      {title:'Tools for noticing', meta:'essay \u00b7 9 min', blurb:'Thinking tools are really attention tools.',
        sub:S('Attention first','what you see','Notes as lenses','reframe','Friction as feature','slow on purpose')},
      {title:'Against the feed', meta:'essay \u00b7 7 min', blurb:'Reclaiming the pace of reading.',
        sub:S('The infinite scroll','no bottom','Reclaiming pace','set the speed','Curated diets','choose inputs')},
      {title:'Local-first, human-first', meta:'essay \u00b7 14 min', blurb:'Owning your data is owning your thinking.',
        sub:S('Own your data','it\u2019s yours','Sync without servers','peer to peer','Longevity','readable in 20 yrs')}
    ]},
  garden: { label:'Garden', title:'The Garden', kind:'shoot',
    intro:'Evergreen notes, tended over time. Some are seedlings; some have grown sturdy.',
    items:[
      {title:'Digital gardens', meta:'evergreen', blurb:'On tending ideas in public, in no particular order.',
        sub:S('What & why','learning in public','Tending cadence','weekly water','Public learning','show the rough')},
      {title:'Composting ideas', meta:'seedling', blurb:'Letting half-thoughts rot down into something useful.',
        sub:S('Half-thoughts','keep them','Decay & reuse','break down','Surfacing','dig them up')},
      {title:'Zettelkasten, honestly', meta:'budding', blurb:'What actually stuck after two years of slip-boxes.',
        sub:S('Slip-box basics','atomic notes','What stuck','links, mostly','What didn\u2019t','rigid IDs')},
      {title:'Spaced repetition', meta:'evergreen', blurb:'Remembering on purpose, a little at a time.',
        sub:S('Forgetting curve','review before loss','Daily reviews','small batches','Tooling','plain cards')}
    ]},
  notes: { label:'Notes', title:'Notes', kind:'shoot',
    intro:'Short things learned \u2014 the day-to-day cuttings that don\u2019t need an essay.',
    items:[
      {title:'Engineering', meta:'18 articles', blurb:'Distributed systems, the web platform, small code.',
        sub:S('CRDTs in 200 lines','merge logic','CSS subgrid','aligning cards','Edge caching','stale-while-revalidate')},
      {title:'Gardening', meta:'11 articles', blurb:'Grafting, soil, and tending things slowly.',
        sub:S('Grafting apples','rootstock & scion','Composting','the slow loop','Companion planting','what pairs')},
      {title:'Reading & ideas', meta:'14 articles', blurb:'Patterns, design philosophy, marginalia.',
        sub:S('Reading Alexander','a pattern language','Bret Victor','dynamic tools','Marginalia','scribbles kept')},
      {title:'Tools & craft', meta:'7 articles', blurb:'Editors, workflows, sharpening the saw.',
        sub:S('Editor setup','keybinds','Shell glue','tiny scripts','Note-taking','capture fast')},
      {title:'Writing', meta:'9 articles', blurb:'Drafting, editing, finding the thread.',
        sub:S('Draft fast','ugly first','Edit slow','read aloud','Structure','one idea each')},
      {title:'Design', meta:'12 articles', blurb:'Type, color, and interfaces that breathe.',
        sub:S('Type scale','rhythm','Color','restraint','Whitespace','let it breathe')},
      {title:'Life & systems', meta:'6 articles', blurb:'Habits, focus, tending the everyday.',
        sub:S('Morning loop','quiet hours','Focus','one thing','Review','weekly')},
      {title:'Margins', meta:'15 articles', blurb:'Quotes, links, and half-thoughts.',
        sub:S('Quotes','kept lines','Links','to revisit','Half-thoughts','seeds')}
    ]},
  resume: { label:'R\u00e9sum\u00e9', title:'R\u00e9sum\u00e9', kind:'root',
    intro:'Ten years of building, in reverse order. The roots that hold the rest up.',
    items:[
      {title:'Staff Engineer \u2014 independent', meta:'2021\u2013now', blurb:'Building Digital Garden full-time.',
        sub:S('Garden architecture','from scratch','Sync engine','Terrarium','Community','docs & support')},
      {title:'Senior Engineer \u2014 Foliate', meta:'2018\u201321', blurb:'Led the editor & sync teams.',
        sub:S('Editor team lead','5 engineers','Sync rollout','zero data loss','Mentoring','grew 3 seniors')},
      {title:'Product Designer \u2014 Meadow', meta:'2015\u201318', blurb:'Design systems and rapid prototyping.',
        sub:S('Design system','100+ components','Prototyping','code prototypes','Research','weekly tests')},
      {title:'Engineer \u2014 Sprout Labs', meta:'2014\u201315', blurb:'First role; shipped the mobile app.',
        sub:S('Mobile app','iOS + Android','First ship','v1.0','Growth','0\u219250k users')}
    ]},
  about: { label:'About', title:'About', kind:'root',
    intro:'The soil underneath \u2014 who\u2019s tending this garden, and how.',
    items:[
      {title:'Who', meta:'the person', blurb:'Execution engineer. A decade in technology & operations.',
        sub:S('Name','David Valentine','Domain','tech & ops','Location','Desert Southwest')},
      {title:'The work', meta:'how I operate', blurb:'I turn strategy into working systems, and results.',
        sub:S('System design','meets coordination','Map','matches territory','Execution','stays close')},
      {title:'The garden', meta:'actual dirt', blurb:'Permaculture in the desert Southwest. Water scarce, heat intense.',
        sub:S('Habitat','desert SW','Constraint','scarce water','Method','permaculture')},
      {title:'This site', meta:'now', blurb:'A digital garden \u2014 organized by root and branch, not tag.',
        sub:S('Format','digital garden','Structure','root & branch','Status','growing')}
    ]},
  now: { label:'Now', title:'Now', kind:'root',
    intro:'What I\u2019m tending this season \u2014 updated when things actually change.',
    items:[
      {title:'Garden sync engine', meta:'building', blurb:'Rewriting Terrarium\u2019s CRDT core from scratch.',
        sub:S('CRDT rewrite','cleaner core','Test harness','property tests','Beta','soon')},
      {title:'Reading Alexander', meta:'reading', blurb:'A Pattern Language, slowly, with notes.',
        sub:S('A Pattern Language','253 patterns','Notes','margin scribbles','Apply','to software')},
      {title:'Grafting apples', meta:'growing', blurb:'Learning to splice rootstock in the yard.',
        sub:S('Rootstock sourced','dwarf stock','First splices','spring','Waiting','patience')}
    ]},
  contact: { label:'Contact', title:'Contact', kind:'root',
    intro:'Slow channels preferred. I read everything; I reply when it\u2019s ripe.',
    items:[
      {title:'Email', meta:'say hello', blurb:'david@davidvalentine.org',
        sub:S('Address','david@\u2026','Response time','a few days','PGP','on request')},
      {title:'GitHub', meta:'code', blurb:'@davidvalentine',
        sub:S('Repos','open source','Sponsors','keep it free','Issues','I read them')},
      {title:'Mastodon', meta:'social', blurb:'@david@garden.social',
        sub:S('Handle','@david','What I post','garden logs','Replies','usually')},
      {title:'RSS', meta:'subscribe', blurb:'the slow feed \u2014 no algorithm.',
        sub:S('Full feed','everything','No tracking','none','OPML','export ready')}
    ]}
};
