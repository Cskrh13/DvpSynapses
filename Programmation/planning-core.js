/**
 * planning-core.js
 * ---------------------------------------------------------------------------
 * Logique partagée entre planning-gestion.html et planning-affichage.html.
 *
 * ARCHITECTURE SYNAPSES
 *
 * 1. Référentiel officiel
 *    Programmation/data/index.json
 *    Programmation/data/competences.json
 *
 * 2. Bibliothèque de séquences / séances
 *    Les fichiers JSON référencés par index.json.
 *
 * 3. Planning personnel
 *    Stockage local temporaire + possibilité de synchronisation explicite
 *    avec un dossier choisi par l'utilisateur sur une clé USB.
 *
 * IMPORTANT :
 * Les compétences officielles ne sont jamais modifiées par ce fichier.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // ========================================================================
  // CONSTANTES
  // ========================================================================

  const NIVEAUX = ["CP", "CE1", "CE2", "CM1", "CM2"];

  // Catalogue des niveaux disponibles pour créer une classe (configuration
  // générale). Une classe est une entité propre (ex. "CE2 A", "CE2 B") : deux
  // classes peuvent partager le même niveau pédagogique sans partager le
  // même emploi du temps ni la même récréation.
  const NIVEAUX_DISPONIBLES = ["TPS", "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"];

  const PALETTE_CLASSES = ["#2E5EAA", "#B5502E", "#2A7F72", "#6B4E8E", "#B5871E", "#B23A5C", "#3F8C4B", "#8C5E2A", "#5B5F6B", "#1E2A4A"];

  const JOURS = [
    { n: 1, nom: "Lundi" },
    { n: 2, nom: "Mardi" },
    { n: 3, nom: "Mercredi" },
    { n: 4, nom: "Jeudi" },
    { n: 5, nom: "Vendredi" }
  ];

  const TYPES_CRENEAU = {
    seance: {
      label: "Séance",
      couleur: "#2E5EAA"
    },

    recreation: {
      label: "Récréation",
      couleur: "#B5871E"
    },

    pause: {
      label: "Pause méridienne",
      couleur: "#9A9689"
    },

    autre: {
      label: "Autre / rituel",
      couleur: "#5B5F6B"
    }
  };


  // ========================================================================
  // STOCKAGE LOCAL
  // ========================================================================

  const STORE_CONFIG =
    "synapses_planning_config";

  const STORE_GRILLES =
    "synapses_planning_grilles";

  const STORE_AFFECT =
    "synapses_planning_affectations";

  const STORE_JOURNAL =
    "synapses_planning_journal";

  const TYPES_ADULTE = [
    { id: "enseignant", label: "Enseignant" },
    { id: "aesh", label: "AESH" },
    { id: "atsem", label: "ATSEM" },
    { id: "autre", label: "Autre" }
  ];


  // ========================================================================
  // CLÉ USB
  // ========================================================================
  //
  // Le navigateur ne permet pas à une page web d'écrire directement sur
  // n'importe quelle clé USB.
  //
  // L'utilisateur doit donc sélectionner explicitement le dossier racine
  // de sa clé avec showDirectoryPicker().
  //
  // Structure créée :
  //
  // CLE USB/
  // ├── coffre.synapses
  // ├── sequences/
  // ├── planning/
  // │   └── planning.json
  // └── ...
  //
  // ========================================================================

  let usbRootHandle = null;


  /**
   * Demande à l'utilisateur de sélectionner le dossier racine.
   */
  async function connecterDossierUSB() {

    if (!window.showDirectoryPicker) {

      throw new Error(
        "L'accès direct aux dossiers n'est pas disponible " +
        "dans ce navigateur. Utilisez Chrome ou Edge sur ordinateur."
      );

    }

    usbRootHandle =
      await window.showDirectoryPicker({
        mode: "readwrite"
      });

    return usbRootHandle;
  }


  /**
   * Indique si un dossier USB a été connecté.
   */
  function dossierUSBConnecte() {

    return !!usbRootHandle;

  }


  /**
   * Récupère un sous-dossier.
   */
  async function obtenirDossierUSB(
    nom,
    creer = true
  ) {

    if (!usbRootHandle) {

      throw new Error(
        "Aucun dossier USB n'est connecté."
      );

    }

    return await usbRootHandle.getDirectoryHandle(
      nom,
      {
        create: creer
      }
    );

  }


  /**
   * Écrit un fichier JSON.
   */
  async function ecrireJSONUSB(
    nom,
    donnees,
    dossier = null
  ) {

    const dir =
      dossier || usbRootHandle;

    if (!dir) {

      throw new Error(
        "Aucun dossier USB n'est connecté."
      );

    }

    const fichier =
      await dir.getFileHandle(
        nom,
        {
          create: true
        }
      );

    const writable =
      await fichier.createWritable();

    await writable.write(
      JSON.stringify(
        donnees,
        null,
        2
      )
    );

    await writable.close();

  }


  /**
   * Lit un fichier JSON.
   */
  async function lireJSONUSB(
    nom,
    dossier = null
  ) {

    const dir =
      dossier || usbRootHandle;

    if (!dir) {

      throw new Error(
        "Aucun dossier USB n'est connecté."
      );

    }

    const fichier =
      await dir.getFileHandle(nom);

    const file =
      await fichier.getFile();

    const texte =
      await file.text();

    return JSON.parse(texte);

  }


  /**
   * Sauvegarde complète du planning sur la clé.
   *
   * Fichier :
   *
   * planning/planning.json
   */
  async function sauverPlanningUSB(
    config,
    grilles,
    affectations
  ) {

    const planningDir =
      await obtenirDossierUSB(
        "planning",
        true
      );

    const paquet = {

      format:
        "synapses-planning",

      version:
        1,

      maj:
        new Date().toISOString(),

      config:
        config || {},

      grilles:
        grilles || {},

      affectations:
        affectations || {}

    };

    await ecrireJSONUSB(
      "planning.json",
      paquet,
      planningDir
    );

    return paquet;

  }


  /**
   * Charge le planning depuis la clé.
   */
  async function chargerPlanningUSB() {

    const planningDir =
      await obtenirDossierUSB(
        "planning",
        false
      );

    return await lireJSONUSB(
      "planning.json",
      planningDir
    );

  }


  // ========================================================================
  // OUTILS
  // ========================================================================

  function slug(str) {

    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      || "domaine";

  }


  function uid(prefix) {

    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 7)
    );

  }


  function parseNumero(n) {

    const v =
      parseFloat(
        String(n)
          .replace(",", ".")
      );

    return isNaN(v)
      ? 999
      : v;

  }


  function pad2(n) {

    return String(n)
      .padStart(2, "0");

  }


  function dateISO(d) {

    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate())
    );

  }


  function parseISO(s) {

    const parts =
      String(s || "")
        .split("-")
        .map(Number);

    if (parts.length !== 3) {

      return new Date(
        NaN
      );

    }

    return new Date(
      parts[0],
      parts[1] - 1,
      parts[2]
    );

  }


  function addDays(d, n) {

    const r =
      new Date(d);

    r.setDate(
      r.getDate() + n
    );

    return r;

  }


  function mondayOfWeek(d) {

    const r =
      new Date(d);

    const dow =
      (r.getDay() + 6) % 7;

    return addDays(
      r,
      -dow
    );

  }


  function formatDateLong(d) {

    return d.toLocaleDateString(
      "fr-FR",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }
    );

  }


  function formatDateShort(d) {

    return d.toLocaleDateString(
      "fr-FR",
      {
        day: "2-digit",
        month: "2-digit"
      }
    );

  }


  function heureVersMin(h) {

    const morceaux =
      String(h || "0:0")
        .split(":")
        .map(Number);

    const hh =
      morceaux[0] || 0;

    const mm =
      morceaux[1] || 0;

    return (
      hh * 60 +
      mm
    );

  }


  // ========================================================================
  // CHARGEMENT DES JSON
  // ========================================================================

  /**
   * Essaie plusieurs chemins jusqu'à trouver un JSON valide.
   */
  async function fetchFirst(candidats) {

    for (
      const chemin
      of candidats
    ) {

      try {

        const r =
          await fetch(
            chemin,
            {
              cache: "no-store"
            }
          );

        if (
          r.ok
        ) {

          return {

            data:
              await r.json(),

            chemin:
              chemin

          };

        }

      }
      catch (e) {

        // On essaie le chemin suivant.

      }

    }

    return null;

  }


  /**
   * Chemins possibles vers l'index.
   *
   * Le fichier planning-core.js est situé dans :
   *
   * Programmation/
   *
   * Donc le premier chemin est normalement :
   *
   * data/index.json
   */
  function candidatsIndex() {

    return [

      "data/index.json",

      "Programmation/data/index.json",

      "../Programmation/data/index.json",

      "../data/index.json"

    ];

  }


  /**
   * Détermine la base à utiliser pour les chemins de fichiers contenus
   * dans index.json.
   */
  function baseDe(cheminIndex) {

    return cheminIndex.replace(
      /data\/index\.json$/,
      ""
    );

  }


  // ========================================================================
  // BANQUE DE SÉANCES
  // ========================================================================

  /**
   * Charge les séances depuis :
   *
   * 1. index.json
   * 2. les fichiers JSON référencés
   * 3. les données locales créées par sequences.html
   *
   * Retour :
   *
   * {
   *   niveau: {
   *     domaine: {
   *       label: "...",
   *       items: [...]
   *     }
   *   }
   * }
   */
  async function chargerBanque() {

    const banque = {};


    function domaineDe(
      niveau,
      cle
    ) {

      if (!banque[niveau]) {

        banque[niveau] = {};

      }

      if (
        !banque[niveau][cle]
      ) {

        banque[niveau][cle] = {

          label:
            cle,

          items:
            []

        };

      }

      return banque[niveau][cle];

    }


    // ======================================================================
    // 1. FICHIERS DU DÉPÔT
    // ======================================================================

    const idx =
      await fetchFirst(
        candidatsIndex()
      );


    if (idx) {

      const base =
        baseDe(
          idx.chemin
        );


      for (
        const niv
        of (idx.data.niveaux || [])
      ) {

        for (
          const disc
          of (niv.disciplines || [])
        ) {

          for (
            const dom
            of (disc.domaines || [])
          ) {

            const cle =
              `${disc.id}::${dom.id}`;


            const bucket =
              domaineDe(
                niv.id,
                cle
              );


            bucket.label =
              `${disc.nom || disc.id} — ${dom.nom || dom.id}`;


            let ordre =
              0;


            for (
              const seq
              of (dom.sequences || [])
            ) {

              for (
                const sea
                of (seq.seances || [])
              ) {

                bucket.items.push({

                  id:
                    sea.id,

                  domaineCle:
                    cle,

                  seqId:
                    seq.id,

                  seqTitre:
                    seq.titre || "",

                  numero:
                    sea.numero,

                  type:
                    sea.type || "",

                  titre:
                    sea.titre || "",

                  source:
                    "fichier",

                  fichier:
                    base + sea.fichier,

                  ordreSeq:
                    ordre

                });

              }

              ordre++;

            }

          }

        }

      }

    }


    // ======================================================================
    // 2. DONNÉES LOCALES
    // ======================================================================

    let seqs = [];
    let seas = [];


    try {

      seqs =
        JSON.parse(
          localStorage.getItem(
            "planif_sequences"
          )
        ) || [];

    }
    catch (e) {

      seqs = [];

    }


    try {

      seas =
        JSON.parse(
          localStorage.getItem(
            "planif_seances"
          )
        ) || [];

    }
    catch (e) {

      seas = [];

    }


    const seqById =
      new Map(
        seqs.map(
          s => [s.id, s]
        )
      );


    seqs.forEach(
      (s, i) => {

        s.__ordre =
          i;

      }
    );


    seas.forEach(
      sea => {

        const seq =
          seqById.get(
            sea.sequence_id
          );


        const niveau =
          (seq && seq.niveau) ||
          sea.classe ||
          NIVEAUX[0];


        const matiere =
          (seq && seq.matiere) ||
          "Français";


        const champ =
          (seq &&
            (
              seq.competence_id ||
              seq.domaine
            )
          ) ||
          "lecture";


        const cle =
          `${slug(matiere)}::${champ}`;


        const bucket =
          domaineDe(
            niveau,
            cle
          );


        if (
          bucket.label === cle
        ) {

          bucket.label =
            `${matiere} — ${champ}`;

        }


        bucket.items.push({

          id:
            sea.id,

          domaineCle:
            cle,

          seqId:
            sea.sequence_id,

          seqTitre:
            (
              seq &&
              (
                seq.titre ||
                seq.nom
              )
            ) || "",

          numero:
            sea.numero,

          type:
            sea.type || "",

          titre:
            sea.titre || "",

          source:
            "local",

          deroule:
            sea.deroule || [],

          objectif_commun:
            sea.objectif_commun || "",

          problematique:
            sea.problematique || "",

          competence_cible:
            sea.competence_cible || "",

          ordreSeq:
            seq
              ? seq.__ordre
              : 999

        });

      }
    );


    // ======================================================================
    // TRI
    // ======================================================================

    Object
      .values(banque)
      .forEach(
        parNiveau => {

          Object
            .values(parNiveau)
            .forEach(
              bucket => {

                bucket.items.sort(
                  (a, b) => {

                    return (
                      a.ordreSeq -
                      b.ordreSeq
                    ) ||
                    (
                      parseNumero(a.numero) -
                      parseNumero(b.numero)
                    );

                  }
                );

              }
            );

        }
      );


    return banque;

  }


  // ========================================================================
  // CHARGEMENT DU DÉROULÉ
  // ========================================================================

  async function chargerDerouleDeItem(item) {

    if (
      item.source === "local"
    ) {

      return item;

    }


    const r =
      await fetch(
        item.fichier,
        {
          cache: "no-store"
        }
      );


    if (!r.ok) {

      throw new Error(
        "Fichier de séance introuvable : " +
        item.fichier
      );

    }


    const data =
      await r.json();


    return Object.assign(
      {},
      item,
      {

        deroule:
          data.deroule || [],

        objectif_commun:
          data.objectif_commun || "",

        problematique:
          data.problematique || "",

        competence_cible:
          data.competence_cible || "",

        modalites_generales:
          data.modalites_generales || "",

        vigilance:
          data.vigilance || "",

        titre:
          data.titre ||
          item.titre

      }
    );

  }


  // ========================================================================
  // CONFIGURATION
  // ========================================================================

  function chargerConfig() {

    try {

      const c =
        JSON.parse(
          localStorage.getItem(
            STORE_CONFIG
          )
        );


      if (c) {

        // Rétro-compatibilité : complète les champs ajoutés après coup
        // sans jamais écraser une config existante.
        if (!c.joursTravailles || !c.joursTravailles.length) c.joursTravailles = [1, 2, 3, 4, 5];
        if (!Array.isArray(c.recreations)) c.recreations = [
          { label: "Récréation matin", debut: "10:00", fin: "10:15", classes: [] }
        ];
        if (!Array.isArray(c.pauses)) c.pauses = [
          { label: "Pause méridienne", debut: "12:00", fin: "13:30", classes: [] }
        ];
        // Ancien modèle "niveauxActifs" (CP/CE1/CE2…) -> nouveau modèle
        // "classes" (entités propres, ex. deux CE2 distincts). On migre une
        // seule fois : chaque niveau actif devient une classe portant ce
        // niveau comme nom par défaut.
        if (!Array.isArray(c.classes)) {
          c.classes = (c.niveauxActifs || []).map((n, i) => ({
            id: uid("cls"), nom: n, niveau: n, couleur: PALETTE_CLASSES[i % PALETTE_CLASSES.length]
          }));
        }
        c.classes.forEach((cl, i) => {
          if (!cl.id) cl.id = uid("cls");
          if (!cl.couleur) cl.couleur = PALETTE_CLASSES[i % PALETTE_CLASSES.length];
          if (!cl.nom) cl.nom = cl.niveau || "Classe";
        });
        // Migration des récréations/pauses sans champ `classes` : réputées
        // s'appliquer à toutes les classes (comportement historique).
        c.recreations.forEach(r => { if (!Array.isArray(r.classes)) r.classes = []; });
        c.pauses.forEach(p => { if (!Array.isArray(p.classes)) p.classes = []; });

        return c;

      }

    }
    catch (e) {

      // Configuration absente ou invalide.

    }


    return {

      rentree:
        "",

      semaines:
        36,

      vacances:
        [],

      // Classes créées par l'enseignant (configuration générale). Chaque
      // classe = { id, nom, niveau, couleur }. Remplace l'ancien
      // "niveauxActifs" : deux classes du même niveau (ex. deux CE2)
      // peuvent avoir des récréations et des grilles horaires différentes.
      classes:
        [],

      // Jours de la semaine travaillés (1=lundi … 5=vendredi).
      joursTravailles:
        [1, 2, 3, 4, 5],

      // Récréations et pauses méridiennes : pensées à l'échelle de l'école,
      // donc définies une seule fois ici, avec la liste des classes
      // concernées par chaque service (`classes: []` = toutes les classes).
      // Plusieurs entrées = plusieurs récréations (matin/après-midi) ou
      // plusieurs services de pause méridienne (par ex. un service par
      // groupe de classes).
      recreations:
        [{ label: "Récréation matin", debut: "10:00", fin: "10:15", classes: [] }],

      pauses:
        [{ label: "Pause méridienne", debut: "12:00", fin: "13:30", classes: [] }]

    };

  }


  function sauverConfig(c) {

    localStorage.setItem(
      STORE_CONFIG,
      JSON.stringify(c)
    );

  }


  // ------------------------------------------------------------------------
  // Classes (configuration générale)
  // ------------------------------------------------------------------------

  function chargerClasses(config) {
    config = config || chargerConfig();
    return config.classes || [];
  }

  function creerClasse(config, nom, niveau) {
    const cl = {
      id: uid("cls"),
      nom: (nom || niveau || "Classe").trim(),
      niveau: niveau || "",
      couleur: PALETTE_CLASSES[config.classes.length % PALETTE_CLASSES.length]
    };
    config.classes.push(cl);
    return cl;
  }

  function supprimerClasse(config, classeId, grilles, affectations) {
    config.classes = config.classes.filter(c => c.id !== classeId);
    config.recreations.forEach(r => { r.classes = (r.classes || []).filter(id => id !== classeId); });
    config.pauses.forEach(p => { p.classes = (p.classes || []).filter(id => id !== classeId); });
    if (grilles) delete grilles[classeId];
    if (affectations) delete affectations[classeId];
  }

  function classeById(config, classeId) {
    return (config.classes || []).find(c => c.id === classeId) || null;
  }

  /** Identifiants des classes concernées par un service (récréation/pause) :
   *  `def.classes` vide ou absent = toutes les classes de la config. */
  function classesDuService(config, def) {
    if (def.classes && def.classes.length) return def.classes;
    return (config.classes || []).map(c => c.id);
  }


  // ------------------------------------------------------------------------
  // Export / import de la configuration du planning (fichier .json)
  // ------------------------------------------------------------------------
  // Contient : classes, jours travaillés, récréations/pauses, rentrée,
  // nombre de semaines et vacances — c'est-à-dire tout ce qui se règle
  // dans les onglets "Configuration générale" et "Jours travaillés &
  // horaires fixes". Les grilles horaires détaillées par classe ne sont
  // PAS incluses ici (elles se gèrent séparément, onglet par onglet) afin
  // de garder ce fichier court et facilement partageable entre collègues.
  function exporterConfigJSON(config) {
    const payload = {
      type: "synapses-planning-config",
      version: 1,
      exporteLe: new Date().toISOString(),
      rentree: config.rentree,
      semaines: config.semaines,
      vacances: config.vacances,
      classes: config.classes,
      joursTravailles: config.joursTravailles,
      recreations: config.recreations,
      pauses: config.pauses
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "synapses-planning-config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Fusionne un fichier de configuration importé dans la config courante.
   *  Remplace entièrement classes / jours / récréations / pauses / calendrier
   *  (import "franc" plutôt que fusion silencieuse, pour rester prévisible). */
  function importerConfigJSON(config, payload) {
    if (!payload || typeof payload !== "object") throw new Error("Fichier de configuration invalide.");
    if (Array.isArray(payload.classes)) config.classes = payload.classes.map(c => ({
      id: c.id || uid("cls"), nom: c.nom || c.niveau || "Classe", niveau: c.niveau || "", couleur: c.couleur || PALETTE_CLASSES[0]
    }));
    if (typeof payload.rentree === "string") config.rentree = payload.rentree;
    if (typeof payload.semaines === "number") config.semaines = payload.semaines;
    if (Array.isArray(payload.vacances)) config.vacances = payload.vacances;
    if (Array.isArray(payload.joursTravailles) && payload.joursTravailles.length) config.joursTravailles = payload.joursTravailles;
    if (Array.isArray(payload.recreations)) config.recreations = payload.recreations.map(r => ({ label: r.label || "Récréation", debut: r.debut, fin: r.fin, classes: r.classes || [] }));
    if (Array.isArray(payload.pauses)) config.pauses = payload.pauses.map(p => ({ label: p.label || "Pause méridienne", debut: p.debut, fin: p.fin, classes: p.classes || [] }));
    return config;
  }


  // ========================================================================
  // GRILLES
  // ========================================================================

  function chargerGrilles() {

    try {

      return (
        JSON.parse(
          localStorage.getItem(
            STORE_GRILLES
          )
        ) || {}
      );

    }
    catch (e) {

      return {};

    }

  }


  function sauverGrilles(g) {

    localStorage.setItem(
      STORE_GRILLES,
      JSON.stringify(g)
    );

  }

  // ------------------------------------------------------------------------
  // Récréations / pauses "fixes", pilotées depuis la configuration générale
  // ------------------------------------------------------------------------
  //
  // Plutôt que de les saisir créneau par créneau et niveau par niveau, on les
  // définit une fois (config.recreations / config.pauses) et on les
  // applique automatiquement à chaque niveau, sur chaque jour travaillé.
  // Chaque occurrence générée porte un identifiant stable
  // ("fixe_<niveau>_<jour>_<type>_<index>") pour pouvoir être mise à jour à
  // l'identique plutôt que dupliquée si on relance l'application, et pour
  // être proprement retirée si le nombre d'occurrences ou les jours
  // travaillés changent ensuite.
  //
  function upsertCreneauFixe(liste, classeId, jour, type, index, def) {
    const id = "fixe_" + classeId + "_" + jour + "_" + type + "_" + index;
    let c = liste.find(x => x.id === id);
    if (!c) {
      c = {
        id: id, jour: jour, debut: def.debut, fin: def.fin, type: type,
        libelle: def.label || "", domaineCle: "",
        // Métadonnées stockées explicitement : l'id ne peut pas être reparsé
        // de façon fiable puisque classeId (via uid()) contient lui-même des
        // "_" (ex. "cls_lx8f3k2_ab3de"), ce qui décale tout split("_").
        _fixeJour: jour, _fixeType: type, _fixeIndex: index
      };
      liste.push(c);
    } else {
      c.debut = def.debut;
      c.fin = def.fin;
      c.libelle = def.label || "";
      c._fixeJour = jour;
      c._fixeType = type;
      c._fixeIndex = index;
    }
    return c;
  }

  /**
   * Applique les récréations / pauses méridiennes (pensées à l'échelle de
   * l'école, définies une seule fois dans la configuration générale) à la
   * grille de chaque classe concernée. Une classe absente de `def.classes`
   * (ou `def.classes` vide = toutes les classes) ne reçoit pas ce créneau :
   * c'est ce qui permet à deux CE2 de ne pas partager la même récréation.
   */
  function appliquerCreneauxFixes(config, grilles, classeIds) {
    const toutesLesClasses = (config.classes || []).map(c => c.id);
    classeIds = (classeIds && classeIds.length) ? classeIds : toutesLesClasses;
    const jours = (config.joursTravailles && config.joursTravailles.length) ? config.joursTravailles.map(Number) : [1,2,3,4,5];
    const recreations = Array.isArray(config.recreations) ? config.recreations : [];
    const pauses = Array.isArray(config.pauses) ? config.pauses : [];
    let ajoutes = 0, misAJour = 0;

    classeIds.forEach(classeId => {
      grilles[classeId] = Array.isArray(grilles[classeId]) ? grilles[classeId] : [];
      const grille = grilles[classeId];
      jours.forEach(j => {
        recreations.forEach((def, idx) => {
          if (!classesDuService(config, def).includes(classeId)) return;
          const id = "fixe_" + classeId + "_" + j + "_recreation_" + idx;
          const existait = grille.some(c => c && c.id === id);
          upsertCreneauFixe(grille, classeId, j, "recreation", idx, def);
          existait ? misAJour++ : ajoutes++;
        });
        pauses.forEach((def, idx) => {
          if (!classesDuService(config, def).includes(classeId)) return;
          const id = "fixe_" + classeId + "_" + j + "_pause_" + idx;
          const existait = grille.some(c => c && c.id === id);
          upsertCreneauFixe(grille, classeId, j, "pause", idx, def);
          existait ? misAJour++ : ajoutes++;
        });
      });

      grilles[classeId] = grille.filter(c => {
        if (!c || !c.id || !c.id.startsWith("fixe_" + classeId + "_")) return true;
        const jr = Number(c._fixeJour), idx = Number(c._fixeIndex), typ = c._fixeType;
        if (!Number.isFinite(jr) || !typ || !Number.isFinite(idx)) return false;
        if (!jours.includes(jr)) return false;
        const liste = typ === "recreation" ? recreations : typ === "pause" ? pauses : null;
        if (!liste || idx < 0 || idx >= liste.length) return false;
        return classesDuService(config, liste[idx]).includes(classeId);
      });
    });

    return { ajoutes, misAJour, total: ajoutes + misAJour };
  }


  // ========================================================================
  // AFFECTATIONS
  // ========================================================================

  function chargerAffectations() {

    try {

      return (
        JSON.parse(
          localStorage.getItem(
            STORE_AFFECT
          )
        ) || {}
      );

    }
    catch (e) {

      return {};

    }

  }


  function sauverAffectations(a) {

    localStorage.setItem(
      STORE_AFFECT,
      JSON.stringify(a)
    );

  }


  function cleCreneau(
    dateStr,
    creneauId
  ) {

    return (
      dateStr +
      "__" +
      creneauId
    );

  }


  // ========================================================================
  // CAHIER JOURNAL (vue à la journée)
  // ========================================================================
  //
  // Une entrée de journal, par date ISO :
  // {
  //   date: "2026-05-25",
  //   remarque: "...",
  //   devoirs: "...",
  //   libellesBlocs: { "09:00|09:30": "Matin 1", ... },   // libellés de bloc personnalisés
  //   exclusions: ["CE1__cr_ab12"],                        // origines retirées à la main
  //   groupes: [
  //     {
  //       id, debut, fin,
  //       origine: "CE1__cr_ab12" | null,   // lien vers le créneau de grille d'origine (null = ajouté à la main)
  //       modifie: false,                    // dès que l'enseignant retouche titre/adulte/horaire : plus jamais resynchronisé
  //       adulte: { type: "enseignant"|"aesh"|"atsem"|"autre", nom: "Vincent" } | null,
  //       titre: "Numération",
  //       domaineCle: "maths::numeration",
  //       niveau: "CE1",
  //       seanceRef: { id, source, fichier } | null,
  //       eleves: ["ELEVE-0042", ...],
  //       remarque: "",
  //       fixe: false            // true pour récréation / pause (pas d'adulte ni d'élèves)
  //     }, ...
  //   ]
  // }
  //
  // Les groupes d'un même horaire (debut/fin identiques) sont affichés côte
  // à côte comme des colonnes parallèles (cf. cahier journal ULIS papier) ;
  // ce regroupement est calculé à l'affichage, pas persisté en imbrication,
  // ce qui permet de suivre chaque groupe individuellement.
  //
  // PRIORITÉ DE SYNCHRONISATION (du plus fort au plus faible) :
  //   1. Cahier journal  — un groupe marqué "modifie" n'est plus jamais
  //      touché par une resynchronisation automatique depuis la grille.
  //   2. Planning (affectations) — une séance affectée manuellement dans
  //      Planning — Affichage (aff.manuel = true) est reprise telle quelle.
  //   3. Planning — Gestion (grille) — sert de valeur par défaut tant que
  //      rien de plus prioritaire ne l'a supplantée.
  //
  // Le journal reste 100% local (localStorage) : aucune identité d'élève
  // n'y est stockée, seulement des identifiants Synapses (ELEVE-xxxx), donc
  // rien de nominatif ne transite. Le rapprochement avec les vrais noms se
  // fait en mémoire, uniquement si le coffre est ouvert dans l'onglet.
  // ========================================================================

  function chargerJournal() {
    try {
      return JSON.parse(localStorage.getItem(STORE_JOURNAL)) || {};
    } catch (e) {
      return {};
    }
  }

  function sauverJournal(j) {
    localStorage.setItem(STORE_JOURNAL, JSON.stringify(j));
  }

  function journalPourDate(iso, journal) {
    journal = journal || chargerJournal();
    if (!journal[iso]) {
      journal[iso] = { date: iso, remarque: "", devoirs: "", libellesBlocs: {}, exclusions: [], groupes: [] };
    }
    // Rétro-compatibilité avec l'ancien format imbriqué (creneaux[].groupes[]).
    if (journal[iso].creneaux && !journal[iso].groupes) {
      const plat = [];
      journal[iso].creneaux.forEach(bloc => {
        (bloc.groupes || []).forEach(g => {
          plat.push(Object.assign({ debut: bloc.debut, fin: bloc.fin, origine: null, modifie: false }, g));
        });
      });
      journal[iso] = {
        date: iso,
        remarque: journal[iso].remarque || "",
        devoirs: journal[iso].devoirs || "",
        libellesBlocs: {},
        exclusions: [],
        groupes: plat
      };
    }
    journal[iso].libellesBlocs = journal[iso].libellesBlocs || {};
    journal[iso].exclusions = journal[iso].exclusions || [];
    journal[iso].groupes = journal[iso].groupes || [];
    return journal[iso];
  }

  function cleBloc(debut, fin) { return debut + "|" + fin; }

  /** Regroupe les groupes d'un jour par plage horaire, triés par heure. */
  function regrouperParBloc(jourJournal) {
    const parCle = new Map();
    jourJournal.groupes.forEach(g => {
      const cle = cleBloc(g.debut, g.fin);
      if (!parCle.has(cle)) parCle.set(cle, { debut: g.debut, fin: g.fin, cle: cle, groupes: [] });
      parCle.get(cle).groupes.push(g);
    });
    return Array.from(parCle.values()).sort((a, b) => heureVersMin(a.debut) - heureVersMin(b.debut));
  }

  function libelleBlocDefaut(debut) {
    const h = heureVersMin(debut);
    if (h < 10 * 60 + 30) return "Matin 1";
    if (h < 12 * 60) return "Matin 2";
    if (h < 15 * 60) return "Après-midi 1";
    return "Après-midi 2";
  }

  function libelleBloc(jourJournal, debut, fin) {
    return jourJournal.libellesBlocs[cleBloc(debut, fin)] || libelleBlocDefaut(debut);
  }

  /**
   * Synchronise le journal d'un jour avec la grille horaire hebdomadaire
   * (et les affectations de séances) de chaque niveau actif.
   *
   * Peut être appelée à chaque ouverture de la page (elle est sans danger) :
   *  - un groupe jamais retouché par l'enseignant ("modifie" = false) est
   *    mis à jour pour refléter la grille/l'affectation actuelles
   *    (horaire, titre, domaine, séance affectée) ;
   *  - un groupe retouché ("modifie" = true) n'est JAMAIS modifié par cette
   *    fonction, conformément à la priorité « cahier journal » ;
   *  - un groupe manuellement supprimé par l'enseignant (son origine est
   *    dans jour.exclusions) n'est jamais recréé ;
   *  - un groupe dont le créneau de grille d'origine a disparu (supprimé
   *    dans Planning — Gestion) est retiré automatiquement, sauf s'il a été
   *    modifié (auquel cas il est conservé, orphelin, plutôt que perdu).
   *  - les groupes ajoutés à la main (origine = null) ne sont jamais touchés.
   */
  function genererJournalDepuisGrille(iso, config, grilles, affectations, banque) {
    const journal = chargerJournal();
    const jour = journalPourDate(iso, journal);
    const jourDate = parseISO(iso);
    const jourSemaine = (jourDate.getDay() + 6) % 7 + 1; // 1=lundi

    const classes = (config.classes && config.classes.length) ? config.classes : [];

    const parOrigine = new Map();
    jour.groupes.forEach(g => { if (g.origine) parOrigine.set(g.origine, g); });

    const originesVues = new Set();

    classes.forEach(classe => {
      const classeId = classe.id;
      const grille = (grilles[classeId] || []).filter(c => c.jour === jourSemaine);
      grille.forEach(c => {
        const origine = classeId + "__" + c.id;
        if (jour.exclusions.indexOf(origine) !== -1) return; // retiré à la main : on respecte ce choix
        originesVues.add(origine);

        const existant = parOrigine.get(origine);
        if (existant && existant.modifie) return; // priorité au cahier journal : on ne touche à rien

        if (c.type !== "seance") {
          const titre = (c.libelle && c.libelle.trim()) ? c.libelle.trim() : TYPES_CRENEAU[c.type].label;
          if (existant) {
            existant.debut = c.debut; existant.fin = c.fin; existant.titre = titre;
          } else {
            jour.groupes.push({
              id: uid("grp"), debut: c.debut, fin: c.fin, origine: origine, modifie: false,
              adulte: null, titre: titre, domaineCle: "", niveau: classe.nom, classeId: classeId, seanceRef: null,
              eleves: [], remarque: "", fixe: true
            });
          }
          return;
        }

        const aff = (affectations[classeId] || {})[cleCreneau(iso, c.id)];
        const bucket = (banque[classe.niveau] && banque[classe.niveau][c.domaineCle]) || null;
        const item = (aff && aff.seanceId && bucket) ? bucket.items.find(it => it.id === aff.seanceId) : null;
        const titre = (item && (item.titre || item.type)) || (bucket ? bucket.label : c.domaineCle);

        if (existant) {
          existant.debut = c.debut; existant.fin = c.fin; existant.titre = titre;
          existant.domaineCle = c.domaineCle; existant.niveau = classe.nom; existant.classeId = classeId;
          existant.seanceRef = item ? { id: item.id, source: item.source, fichier: item.fichier || null } : null;
        } else {
          jour.groupes.push({
            id: uid("grp"), debut: c.debut, fin: c.fin, origine: origine, modifie: false,
            adulte: { type: "enseignant", nom: "" }, titre: titre, domaineCle: c.domaineCle, niveau: classe.nom, classeId: classeId,
            seanceRef: item ? { id: item.id, source: item.source, fichier: item.fichier || null } : null,
            eleves: [], remarque: "", fixe: false
          });
        }
      });
    });

    // Nettoyage : un groupe synchronisé (origine non nulle) dont le créneau
    // de grille a disparu, et qui n'a jamais été retouché, est retiré.
    jour.groupes = jour.groupes.filter(g => !g.origine || originesVues.has(g.origine) || g.modifie);

    sauverJournal(journal);
    return jour;
  }

  /**
   * Répartition automatique des élèves dans les groupes d'un jour, à
   * partir des besoins/objectifs actifs lus dans le coffre ouvert.
   *
   * Principe (le système suggère, l'enseignant valide) :
   *  - Pour chaque plage horaire, on regarde les groupes "séance" (non figés).
   *  - Chaque élève du coffre est rapproché du groupe dont le domaineCle
   *    correspond le mieux à ses besoins/objectifs actifs (correspondance
   *    de préfixe sur la discipline, ex. "maths" ~ "mathematiques").
   *  - À défaut de correspondance, l'élève est réparti sur le groupe le
   *    moins chargé de la plage (équilibrage), pour qu'aucun groupe ne soit vide.
   *  - Un élève déjà placé (présent dans un groupe de la plage) n'est pas
   *    déplacé : on ne redistribue que les élèves absents de tous les
   *    groupes de cette plage horaire.
   */
  /**
   * Répartition des élèves pour une journée.
   *
   * Règles métier :
   *  - les élèves ne sont PAS enfermés dans leur classe : la classe sert
   *    surtout à connaître le niveau et à appliquer les récréations ;
   *  - un créneau comporte au maximum 3 groupes de travail ;
   *  - les besoins/objectifs actifs et le niveau sont les critères principaux ;
   *  - si la classe de l'élève est en récréation sur la plage, l'élève va
   *    dans la récréation de sa classe ;
   *  - sinon, il est placé dans un groupe de travail avec un enseignant ;
   *  - la répartition est recalculée à chaque clic sur « Répartir les élèves ».
   */
  function repartirElevesAuto(iso, journalJour, coffre) {
    if (!coffre || !coffre.ouvert) return journalJour;

    const eleves = coffre.listerEleves ? coffre.listerEleves() : [];
    if (!eleves.length) return journalJour;

    const norm = v => String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const niveauDe = v => {
      const s = norm(v);
      const m = s.match(/\b(tps|ps|ms|gs|cp|ce1|ce2|cm1|cm2)\b/);
      return m ? m[1] : s;
    };

    const mots = v => norm(v)
      .split(/\s+/)
      .filter(x => x.length >= 3);

    function besoinsEtObjectifs(e) {
      const besoins = (e.besoins || []).map(x =>
        x && typeof x === "object"
          ? (x.domaine || x.champ || x.hypothese || x.libelle || "")
          : x
      );
      const objectifs = (e.objectifs || [])
        .filter(x => !x || !x.statut || x.statut === "actif")
        .map(x =>
          x && typeof x === "object"
            ? (x.domaine || x.libelle || x.contexte || x.champ || "")
            : x
        );
      return besoins.concat(objectifs).map(norm).filter(Boolean);
    }

    function niveauEleve(e) {
      return niveauDe(
        e.niveau || e.classeNiveau || e.classe || e.niveauScolaire || ""
      );
    }

    function classeEleve(e) {
      return norm(
        e.classeId || e.classe || e.classeNom || e.groupeClasse || ""
      );
    }

    function classeDuGroupe(g) {
      return norm(g.classeId || g.classe || g.niveau || "");
    }

    function estRecreation(g) {
      return g.fixe && String(g.origine || "").indexOf("__fixe_") === -1
        ? String(g.titre || "").toLowerCase().indexOf("récré") !== -1
        : g.fixe && String(g.titre || "").toLowerCase().indexOf("récré") !== -1;
    }

    function scoreBesoin(e, g) {
      const besoins = besoinsEtObjectifs(e);
      if (!besoins.length) return 0;

      const cible = norm(
        String(g.domaineCle || "") + " " +
        String(g.titre || "")
      );
      const cibleMots = mots(cible);
      let score = 0;

      besoins.forEach(b => {
        if (!b) return;
        if (cible.indexOf(b) !== -1 || b.indexOf(cible) !== -1) {
          score += 8;
          return;
        }
        const bm = mots(b);
        bm.forEach(m => {
          if (cibleMots.some(x => x === m || x.indexOf(m) === 0 || m.indexOf(x) === 0)) score += 3;
          else if (m.length >= 4 && cible.indexOf(m.slice(0, 4)) !== -1) score += 2;
        });
      });
      return score;
    }

    function scoreNiveau(e, g) {
      const ne = niveauEleve(e);
      const ng = niveauDe(g.niveau || g.classeId || "");
      if (!ne || !ng) return 0;
      return ne === ng ? 4 : 0;
    }

    function groupeScore(e, g) {
      return scoreBesoin(e, g) + scoreNiveau(e, g);
    }

    function classesRecreation(bloc) {
      return bloc.groupes.filter(g => {
        if (!g.fixe) return false;
        const t = norm(g.titre);
        return t.includes("recre") || t.includes("récré");
      });
    }

    function appartientARecreation(e, g) {
      const ec = classeEleve(e);
      const gc = classeDuGroupe(g);
      const en = niveauEleve(e);
      const gn = niveauDe(g.niveau || g.classeId || "");
      if (ec && gc && (ec === gc || gc.indexOf(ec) !== -1 || ec.indexOf(gc) !== -1)) return true;
      return !!(en && gn && en === gn && !ec);
    }

    // Les groupes sont regroupés par horaire exact. On travaille ensuite
    // sur chaque plage indépendamment afin qu'un élève puisse changer de
    // groupe d'un créneau à l'autre.
    regrouperParBloc(journalJour).forEach(bloc => {
      const fixes = bloc.groupes.filter(g => g.fixe);
      const recreations = classesRecreation(bloc);
      const travail = bloc.groupes.filter(g => !g.fixe);

      // Réinitialisation : la commande « Répartir » repart d'une situation
      // propre pour les groupes de travail. Les récréations reçoivent aussi
      // les élèves concernés automatiquement.
      travail.forEach(g => {
        g.eleves = [];
      });
      fixes.forEach(g => {
        g.eleves = [];
      });

      const places = new Map();

      // 1) Récréations : priorité absolue pour les élèves dont la classe
      // est concernée. On ne leur attribue aucun groupe de travail.
      eleves.forEach(e => {
        const id = e.identifiantSynapses;
        if (!id) return;
        const rec = recreations.find(g => appartientARecreation(e, g));
        if (rec) {
          rec.eleves.push(id);
          places.set(id, rec.id);
        }
      });

      // 2) Jusqu'à 3 groupes de travail. Si plus de 3 groupes existent dans
      // les données historiques, on choisit les trois groupes couvrant le
      // mieux les besoins/niveaux des élèves restant à placer.
      let candidats = travail.slice();

      if (candidats.length > 3) {
        const restants = eleves.filter(e => !places.has(e.identifiantSynapses));
        const choisis = [];

        while (choisis.length < 3 && candidats.length) {
          let meilleur = null;
          let meilleurGain = -1;
          candidats.forEach(g => {
            let gain = 0;
            restants.forEach(e => {
              const s = groupeScore(e, g);
              if (s > gain) gain = s;
            });
            // Favorise les groupes de l'enseignant et les groupes déjà
            // explicitement préparés dans le cahier journal.
            if (g.adulte && norm(g.adulte.type) === "enseignant") gain += 1;
            if (gain > meilleurGain) {
              meilleurGain = gain;
              meilleur = g;
            }
          });
          if (!meilleur) break;
          choisis.push(meilleur);
          candidats = candidats.filter(g => g !== meilleur);
        }
        travail.forEach(g => {
          g._repartitionInactif = !choisis.includes(g);
        });
        candidats = choisis;
      } else {
        travail.forEach(g => { g._repartitionInactif = false; });
      }

      // S'il n'existe aucun groupe de travail pour accueillir les élèves qui
      // ne sont pas en récréation, on crée un groupe enseignant unique.
      if (!candidats.length) {
        const id = uid("grp");
        const debut = bloc.debut;
        const fin = bloc.fin;
        const g = {
          id,
          debut,
          fin,
          origine: null,
          modifie: true,
          adulte: { type: "enseignant", nom: "" },
          titre: "Groupe avec l'enseignant",
          domaineCle: "",
          niveau: "",
          classeId: "",
          seanceRef: null,
          eleves: [],
          remarque: "Créé automatiquement pour les élèves hors récréation.",
          fixe: false,
          repartitionAuto: true
        };
        journalJour.groupes.push(g);
        candidats = [g];
      }

      // 3) Attribution : besoins d'abord, niveau ensuite, puis équilibrage.
      const restants = eleves.filter(e => !places.has(e.identifiantSynapses));
      restants.forEach(e => {
        const id = e.identifiantSynapses;
        if (!id) return;

        let meilleur = null;
        let meilleurScore = -Infinity;

        candidats.forEach(g => {
          const score = groupeScore(e, g);
          const charge = (g.eleves || []).length;
          // Le nombre d'élèves sert uniquement à départager les groupes
          // ayant une pertinence comparable.
          const total = score * 100 - charge;
          if (total > meilleurScore) {
            meilleurScore = total;
            meilleur = g;
          }
        });

        if (meilleur) {
          meilleur.eleves = meilleur.eleves || [];
          meilleur.eleves.push(id);
          places.set(id, meilleur.id);
        }
      });

      // 4) Nettoyage des groupes créés automatiquement qui resteraient vides.
      journalJour.groupes = journalJour.groupes.filter(g =>
        !g.repartitionAuto || (g.eleves && g.eleves.length)
      );
    });

    // Retire le marqueur technique avant sauvegarde.
    journalJour.groupes.forEach(g => {
      delete g._repartitionInactif;
    });

    const journal = chargerJournal();
    journal[iso] = journalJour;
    sauverJournal(journal);
    return journalJour;
  }

  /**
   * Construit une répartition hebdomadaire automatique des élèves.
   *
   * Référentiel horaire utilisé (BO n°44 du 26/11/2015) :
   *   - CP/CE1/CE2 : Français 10 h, Mathématiques 5 h / semaine.
   *   - CM1/CM2    : Français 8 h, Mathématiques 5 h / semaine.
   *
   * Le moteur ne remplace pas les choix manuels :
   *   - un élève déjà affecté manuellement dans sa classe sur un créneau
   *     n'est pas ajouté à un groupe de soutien sur ce créneau ;
   *   - les récréations sont prioritaires ;
   *   - maximum 3 groupes automatiques par créneau ;
   *   - les groupes sont d'abord constitués par niveau, puis affinés
   *     par besoins/objectifs ;
   *   - le matin, priorité Français/Mathématiques ;
   *   - en début d'après-midi, une plage de 30 min est prioritairement
   *     utilisée pour lecture/écriture ;
   *   - les créneaux restants servent à combler les objectifs/besoins.
   *
   * Les identifiants d'élèves restent en mémoire via le coffre : aucune donnée
   * nominative n'est enregistrée dans la configuration.
   */
  function repartirElevesSemaineAuto(config, grilles, affectations, coffre) {
    if (!coffre || !coffre.ouvert) {
      throw new Error("Ouvrez le coffre avant de répartir les élèves.");
    }

    const eleves = coffre.listerEleves ? coffre.listerEleves() : [];
    if (!eleves.length) throw new Error("Aucun élève disponible dans le coffre.");

    const semaines = calculerSemaines(config || {});
    const joursTravail = new Set((config.joursTravailles || [1,2,3,4,5]).map(Number));
    const journal = chargerJournal();
    const FIN_JOURNEE = 16 * 60 + 30; // La journée scolaire se termine à 16 h 30.

    const norm = v => String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const niveaux = ["CP", "CE1", "CE2", "CM1", "CM2"];
    const niveauDe = v => {
      const s = norm(v);
      const m = s.match(/\b(cp|ce1|ce2|cm1|cm2)\b/);
      return m ? m[1].toUpperCase() : String(v || "").trim().toUpperCase();
    };
    const rangNiveau = n => {
      const i = niveaux.indexOf(niveauDe(n));
      return i < 0 ? 99 : i;
    };

    // Les données du coffre peuvent avoir été créées avec des noms de champs
    // légèrement différents. On accepte plusieurs formes pour les équivalences
    // scolaires, l'autonomie et le besoin d'AESH.
    const premier = (e, chemins) => {
      for (const chemin of chemins) {
        let v = e;
        for (const k of chemin.split(".")) v = v && typeof v === "object" ? v[k] : undefined;
        if (v !== undefined && v !== null && v !== "") return v;
      }
      return null;
    };

    const extraireNiveauEquivalent = v => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object") {
        return niveauDe(v.niveau || v.equivalence || v.equivalenceScolaire || v.classe || v.libelle || "");
      }
      const n = niveauDe(v);
      return niveaux.includes(n) ? n : "";
    };

    const niveauFrancais = e => extraireNiveauEquivalent(premier(e, [
      "niveauFrancais", "niveauFrançais", "niveauScolaireFrancais", "niveauScolaireFrançais",
      "francais.niveau", "français.niveau", "equivalenceFrancais", "equivalenceFrançais",
      "equivalenceScolaire.francais", "equivalenceScolaire.français", "niveauxScolaires.francais",
      "niveauxScolaires.français", "francaisEquivalence", "françaisEquivalence"
    ]));

    const niveauMaths = e => extraireNiveauEquivalent(premier(e, [
      "niveauMaths", "niveauMathematiques", "niveauMathématiques", "niveauScolaireMaths",
      "niveauScolaireMathematiques", "niveauScolaireMathématiques", "maths.niveau", "mathematiques.niveau",
      "mathématiques.niveau", "equivalenceMaths", "equivalenceMathematiques", "equivalenceMathématiques",
      "equivalenceScolaire.maths", "equivalenceScolaire.mathematiques", "equivalenceScolaire.mathématiques",
      "niveauxScolaires.maths", "niveauxScolaires.mathematiques", "niveauxScolaires.mathématiques",
      "mathsEquivalence", "mathematiquesEquivalence", "mathématiquesEquivalence"
    ]));

    const niveauEleve = e => niveauDe(
      e.niveau || e.classeNiveau || e.niveauScolaire || e.classe || ""
    );

    const classeEleve = e => norm(
      e.classeId || e.classe || e.classeNom || e.groupeClasse || ""
    );

    const besoinsEleve = e => {
      const a = (e.besoins || []).map(x => typeof x === "object"
        ? (x.domaine || x.champ || x.libelle || x.hypothese || "")
        : x);
      const b = (e.objectifs || []).filter(x => !x || !x.statut || x.statut === "actif")
        .map(x => typeof x === "object"
          ? (x.domaine || x.champ || x.libelle || x.contexte || "")
          : x);
      return a.concat(b).map(norm).filter(Boolean).join(" ");
    };

    const autonomieDe = e => {
      const v = premier(e, [
        "autonomie", "autonome", "capaciteAutonomie", "capacitéAutonomie", "niveauAutonomie",
        "profilAutonomie", "autonomieScolaire", "travailAutonome"
      ]);
      if (typeof v === "boolean") return v ? 2 : 0;
      const s = norm(v);
      if (!s) return 0;
      if (/^(3|4|5|tres autonome|très autonome|bonne|forte|acquis|maitrise|maitrise e|autonome)$/.test(s)) return 2;
      if (/^(2|moyenne|en cours|partielle)$/.test(s)) return 1;
      if (/^(0|1|faible|fragile|non|besoin aide|avec aide)$/.test(s)) return 0;
      return /autonome|independant|independante|independance/.test(s) ? 2 : 0;
    };

    const besoinAESHDe = e => {
      const v = premier(e, [
        "aesh", "besoinAesh", "besoinAESH", "accompagnementAesh", "accompagnementAESH",
        "aideHumaine", "accompagnement.humain", "accompagnement.aesh"
      ]);
      if (typeof v === "boolean") return v;
      const s = norm(v);
      if (s && /aesh|aide humaine|accompagnement humain|accompagnement aesh/.test(s)) return true;
      return /aesh|aide humaine|accompagnement humain/.test(besoinsEleve(e));
    };

    const estFixe = g => !!g.fixe;
    const estRecreation = g => {
      const t = norm(g.titre || g.libelle || "");
      return estFixe(g) && (t.includes("recre") || t.includes("pause meridienne"));
    };

    const domaine = g => norm(
      (g.domaineCle || "") + " " + (g.titre || "") + " " + (g.seanceRef && g.seanceRef.titre || "")
    );

    const estFrancais = g => {
      const d = domaine(g);
      return d.includes("franc") || d.includes("lecture") || d.includes("ecriture") ||
             d.includes("oral") || d.includes("comprehension");
    };
    const estMaths = g => {
      const d = domaine(g);
      return d.includes("math") || d.includes("nombres") || d.includes("calcul") ||
             d.includes("grandeurs") || d.includes("geometr");
    };
    const estLectureEcriture = g => {
      const d = domaine(g);
      return d.includes("lecture") || d.includes("ecriture") ||
             d.includes("comprehension") || d.includes("production");
    };

    const minutes = (a,b) => Math.max(0, heureVersMin(b) - heureVersMin(a));
    const cible = {
      CP:  { francais: 600, maths: 300 },
      CE1: { francais: 600, maths: 300 },
      CE2: { francais: 600, maths: 300 },
      CM1: { francais: 480, maths: 300 },
      CM2: { francais: 480, maths: 300 }
    };

    const ids = new Map(eleves.map(e => [e.identifiantSynapses, e]).filter(x => x[0]));
    const stats = {};
    eleves.forEach(e => {
      stats[e.identifiantSynapses] = { francais: 0, maths: 0, lectureEcriture: 0, autres: 0 };
    });

    const estDansSaClasse = (jour, e, bloc) => {
      const id = e.identifiantSynapses;
      return bloc.groupes.some(g => {
        if (estFixe(g) || !g.modifie || !(g.eleves || []).includes(id)) return false;
        const gc = norm(g.classeId || g.classe || "");
        const ec = classeEleve(e);
        return gc && ec && (gc === ec || gc.includes(ec) || ec.includes(gc));
      });
    };

    // Une séance est caractérisée par la discipline visée et, si possible,
    // par le niveau scolaire d'équivalence de l'élève. L'équivalence en
    // français et celle en mathématiques sont indépendantes.
    const objectifDiscipline = (bloc, e) => {
      const h = heureVersMin(bloc.debut);
      const duree = minutes(bloc.debut, bloc.fin);
      const estMatin = h < 12 * 60;
      const estDebutAPM = h >= 12 * 60 && h < 14 * 60 && duree === 30;
      const n = niveauEleve(e);
      const c = cible[n] || { francais: 0, maths: 0 };

      if (estMatin) {
        if (stats[e.identifiantSynapses].francais < c.francais) return "francais";
        if (stats[e.identifiantSynapses].maths < c.maths) return "maths";
        return "francais";
      }
      if (estDebutAPM) return "lectureEcriture";
      return null;
    };

    const niveauPourDiscipline = (e, discipline) => {
      if (discipline === "francais" || discipline === "lectureEcriture") return niveauFrancais(e) || niveauEleve(e);
      if (discipline === "maths") return niveauMaths(e) || niveauEleve(e);
      return niveauEleve(e);
    };

    const modeAutomatique = (e, discipline) => {
      // AESH en premier : un besoin explicite d'aide humaine prime sur
      // l'autonomie déclarée.
      if (besoinAESHDe(e)) return "aesh";
      // L'autonomie est réservée aux élèves déclarés capables de travailler
      // seuls. Les élèves dont l'autonomie est inconnue restent avec un adulte.
      if (autonomieDe(e) >= 2) return "autonomie";
      return "enseignant";
    };

    const titreMode = {
      enseignant: "Groupe avec l'enseignant",
      aesh: "Groupe avec AESH",
      autonomie: "Groupe en autonomie"
    };

    function choisirGroupe(bloc, e, groupes) {
      const id = e.identifiantSynapses;
      const discipline = objectifDiscipline(bloc, e);
      const niveauEquivalent = niveauPourDiscipline(e, discipline);
      const mode = modeAutomatique(e, discipline);
      const n = niveauEleve(e);
      const besoin = besoinsEleve(e);

      let eligibles = groupes.filter(g => !estFixe(g) && !(g.eleves || []).includes(id));
      if (!eligibles.length) return null;

      const scoreG = g => {
        let s = 0;
        const gm = norm(g.modeGroupe || (g.adulte && g.adulte.type) || "enseignant");
        const gn = niveauDe(g.niveauEquivalent || g.niveau || "");
        const gd = domaine(g);

        if (gm === mode) s += 180;
        else if (mode === "aesh" && gm === "enseignant") s += 20;
        else if (mode === "enseignant" && gm === "aesh") s -= 80;
        else s -= 30;

        if (niveauEquivalent && gn === niveauEquivalent) s += 140;
        else if (n && gn === n) s += 35;

        if (discipline === "francais" && estFrancais(g)) s += 90;
        if (discipline === "maths" && estMaths(g)) s += 90;
        if (discipline === "lectureEcriture" && estLectureEcriture(g)) s += 90;

        if (besoin) {
          const mots = besoin.split(/\s+/).filter(x => x.length >= 4);
          mots.forEach(m => { if (gd.includes(m)) s += 5; });
        }

        s -= (g.eleves || []).length * 0.25;
        return s;
      };

      eligibles.sort((a,b) => scoreG(b) - scoreG(a));
      return eligibles[0] || null;
    }

    let nbAjouts = 0;
    let nbGroupes = 0;
    let nbAutonomie = 0;
    let nbAesh = 0;
    let nbEnseignant = 0;

    semaines.forEach(sem => {
      JOURS.forEach(j => {
        if (!joursTravail.has(j.n)) return;
        const iso = dateISO(addDays(sem.lundi, j.n - 1));
        const jour = genererJournalDepuisGrille(iso, config, grilles, affectations || {}, {});
        const blocs = regrouperParBloc(jour);

        // À chaque nouvelle génération, les groupes automatiques précédents
        // sont reconstruits afin de ne jamais conserver un ancien mode, une
        // ancienne équivalence ou une ancienne composition de groupe.
        jour.groupes = jour.groupes.filter(g => !g.repartitionAuto);

        blocs.forEach(bloc => {
          // Aucun groupe automatique ne doit dépasser la fin de la journée.
          if (heureVersMin(bloc.fin) > FIN_JOURNEE) return;

          const recreations = bloc.groupes.filter(estRecreation);
          const travail = bloc.groupes.filter(g => !estFixe(g));

          const disponibles = eleves.filter(e => {
            const id = e.identifiantSynapses;
            if (!id) return false;
            if (recreations.some(r => {
              const rc = norm(r.classeId || r.classe || "");
              const ec = classeEleve(e);
              const rn = niveauDe(r.niveau || r.classeId || "");
              return (rc && ec && (rc === ec || rc.includes(ec) || ec.includes(rc))) ||
                     (!ec && rn && rn === niveauEleve(e));
            })) return false;
            if (estDansSaClasse(jour, e, bloc)) return false;
            return true;
          });
          if (!disponibles.length) return;

          // Les groupes existants avec un adulte sont réutilisés. Pour la
          // répartition automatique, on crée au plus un groupe par mode :
          // enseignant, AESH, autonomie. Le choix du mode est fait élève par
          // élève, mais le niveau d'équivalence reste le critère de composition.
          let auto = travail.filter(g => g.repartitionAuto);
          const modesNecessaires = [...new Set(disponibles.map(e => modeAutomatique(e, objectifDiscipline(bloc, e))))];

          modesNecessaires.forEach(mode => {
            if (auto.some(g => (g.modeGroupe || "") === mode)) return;
            if (auto.length >= 3) return;

            const membres = disponibles.filter(e => modeAutomatique(e, objectifDiscipline(bloc, e)) === mode);
            if (!membres.length) return;

            const disciplines = membres.map(e => objectifDiscipline(bloc, e)).filter(Boolean);
            const discipline = disciplines.length
              ? ["francais","maths","lectureEcriture"].sort((a,b) =>
                  disciplines.filter(x => x === b).length - disciplines.filter(x => x === a).length
                )[0]
              : "";
            const niveauxEquiv = membres.map(e => niveauPourDiscipline(e, discipline)).filter(Boolean);
            const niveauEquivalent = niveauxEquiv.length
              ? niveauxEquiv.sort((a,b) => niveauxEquiv.filter(x => x === b).length - niveauxEquiv.filter(x => x === a).length)[0]
              : "";

            const g = {
              id: uid("grp"),
              debut: bloc.debut,
              fin: bloc.fin,
              origine: null,
              modifie: true,
              adulte: mode === "enseignant" ? { type: "enseignant", nom: "" }
                   : mode === "aesh" ? { type: "aesh", nom: "" }
                   : null,
              modeGroupe: mode,
              titre: titreMode[mode],
              domaineCle: discipline === "francais" ? "francais" : discipline === "maths" ? "maths" : discipline,
              niveau: niveauEquivalent || "",
              niveauEquivalent: niveauEquivalent || "",
              classeId: "",
              seanceRef: null,
              eleves: [],
              remarque: mode === "autonomie"
                ? "Groupe automatique réservé aux élèves capables de travailler en autonomie."
                : "Groupe créé automatiquement selon le mode d'accompagnement, le niveau d'équivalence en français/mathématiques, les besoins et les objectifs.",
              fixe: false,
              repartitionAuto: true,
              profilAuto: mode + (niveauEquivalent ? "|" + niveauEquivalent : "")
            };
            jour.groupes.push(g);
            auto.push(g);
            nbGroupes++;
            if (mode === "autonomie") nbAutonomie++;
            else if (mode === "aesh") nbAesh++;
            else nbEnseignant++;
          });

          const groupesDisponibles = jour.groupes
            .filter(g => !estFixe(g) && !estRecreation(g))
            .filter(g => g.repartitionAuto || !g.classeId);

          disponibles.forEach(e => {
            const id = e.identifiantSynapses;
            if (!ids.has(id)) return;
            const g = choisirGroupe(bloc, e, groupesDisponibles);
            if (!g) return;

            // Une différence de niveau d'équivalence en français ou en maths
            // est prioritaire sur le niveau administratif de la classe.
            const discipline = objectifDiscipline(bloc, e);
            const eq = niveauPourDiscipline(e, discipline);
            const gm = norm(g.modeGroupe || "enseignant");
            const mode = modeAutomatique(e, discipline);
            if (gm !== mode) return;
            if (eq && g.niveauEquivalent && eq !== g.niveauEquivalent) {
              // S'il existe un autre groupe automatique du même mode et de la
              // bonne équivalence, on le choisit plutôt que de mélanger les niveaux.
              const meilleur = groupesDisponibles.find(x =>
                x !== g && (x.modeGroupe || "") === mode &&
                niveauDe(x.niveauEquivalent || x.niveau || "") === eq
              );
              if (meilleur) {
                if (!(meilleur.eleves || []).includes(id)) {
                  meilleur.eleves.push(id);
                  nbAjouts++;
                  if (estFrancais(meilleur)) stats[id].francais += minutes(bloc.debut, bloc.fin);
                  else if (estMaths(meilleur)) stats[id].maths += minutes(bloc.debut, bloc.fin);
                  else if (estLectureEcriture(meilleur)) stats[id].lectureEcriture += minutes(bloc.debut, bloc.fin);
                  else stats[id].autres += minutes(bloc.debut, bloc.fin);
                }
                return;
              }
              // Aucun groupe du bon niveau : ne mélange pas artificiellement
              // les équivalences si un groupe dédié peut être créé.
              if (auto.length < 3) {
                const g2 = {
                  id: uid("grp"), debut: bloc.debut, fin: bloc.fin, origine: null,
                  modifie: true,
                  adulte: mode === "enseignant" ? { type: "enseignant", nom: "" } : mode === "aesh" ? { type: "aesh", nom: "" } : null,
                  modeGroupe: mode,
                  titre: titreMode[mode] + " · " + eq,
                  domaineCle: discipline === "francais" ? "francais" : discipline === "maths" ? "maths" : discipline,
                  niveau: eq, niveauEquivalent: eq, classeId: "", seanceRef: null,
                  eleves: [],
                  remarque: "Groupe automatique composé selon l'équivalence scolaire de la discipline.",
                  fixe: false, repartitionAuto: true, profilAuto: mode + "|" + eq
                };
                jour.groupes.push(g2); auto.push(g2); groupesDisponibles.push(g2); nbGroupes++;
                if (mode === "autonomie") nbAutonomie++;
                else if (mode === "aesh") nbAesh++;
                else nbEnseignant++;
                g2.eleves.push(id); nbAjouts++;
                if (discipline === "francais" || estFrancais(g2)) stats[id].francais += minutes(bloc.debut, bloc.fin);
                else if (discipline === "maths" || estMaths(g2)) stats[id].maths += minutes(bloc.debut, bloc.fin);
                else if (discipline === "lectureEcriture" || estLectureEcriture(g2)) stats[id].lectureEcriture += minutes(bloc.debut, bloc.fin);
                else stats[id].autres += minutes(bloc.debut, bloc.fin);
                return;
              }
            }

            g.eleves = g.eleves || [];
            if (!g.eleves.includes(id)) {
              g.eleves.push(id);
              nbAjouts++;
              if (discipline === "francais" || estFrancais(g)) stats[id].francais += minutes(bloc.debut, bloc.fin);
              else if (discipline === "maths" || estMaths(g)) stats[id].maths += minutes(bloc.debut, bloc.fin);
              else if (discipline === "lectureEcriture" || estLectureEcriture(g)) stats[id].lectureEcriture += minutes(bloc.debut, bloc.fin);
              else stats[id].autres += minutes(bloc.debut, bloc.fin);
            }
          });
        });

        journal[iso] = jour;
      });
    });

    sauverJournal(journal);
    return {
      jours: Object.keys(journal).length,
      ajouts: nbAjouts,
      groupes: nbGroupes,
      groupesEnseignant: nbEnseignant,
      groupesAesh: nbAesh,
      groupesAutonomie: nbAutonomie,
      finJournee: "16:30",
      equivalences: true,
      cibles: "CP-CE2 : français 10 h / maths 5 h ; CM1-CM2 : français 8 h / maths 5 h"
    };
  }

  // ========================================================================
  // IMPORT / EXPORT JSON DU PLANNING (fichier téléchargeable, hors USB)
  // ========================================================================

  function exporterPlanningJSON(config, grilles, affectations, journal) {
    return {
      format: "synapses-planning",
      version: 2,
      maj: new Date().toISOString(),
      config: config || {},
      grilles: grilles || {},
      affectations: affectations || {},
      journal: journal || {}
    };
  }

  function telechargerPlanningJSON(config, grilles, affectations, journal) {
    const paquet = exporterPlanningJSON(config, grilles, affectations, journal);
    const blob = new Blob([JSON.stringify(paquet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "synapses-planning-" + dateISO(new Date()) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return paquet;
  }

  function lireFichierJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch (e) { reject(new Error("Fichier JSON invalide.")); }
      };
      reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
      reader.readAsText(file);
    });
  }

  /**
   * Applique un paquet importé (fichier .json exporté par Synapses) au
   * stockage local courant. Retourne un résumé des parties appliquées.
   */
  function appliquerPaquetPlanning(paquet) {
    if (!paquet || paquet.format !== "synapses-planning") {
      throw new Error("Ce fichier ne semble pas être un export de planning Synapses.");
    }
    const applique = [];
    if (paquet.config) { sauverConfig(paquet.config); applique.push("configuration"); }
    if (paquet.grilles) { sauverGrilles(paquet.grilles); applique.push("grilles horaires"); }
    if (paquet.affectations) { sauverAffectations(paquet.affectations); applique.push("affectations"); }
    if (paquet.journal) { sauverJournal(paquet.journal); applique.push("cahier journal"); }
    return applique;
  }

  // ========================================================================
  // IMPORT DE SÉQUENCES / SÉANCES
  // ========================================================================

  /**
   * Importe une bibliothèque JSON de séquences/séances dans le stockage
   * local utilisé par chargerBanque(). Plusieurs formats sont acceptés :
   *  - { sequences: [...], seances: [...] }
   *  - { planif_sequences: [...], planif_seances: [...] }
   *  - { sequence: {...}, seances: [...] }
   *  - tableau de séquences, chacune pouvant contenir `seances`.
   *
   * L'import est un ajout/fusion par identifiant : les éléments existants
   * sont remplacés seulement lorsqu'un même identifiant est réimporté.
   */
  function importerBibliothequeJSON(payload) {
    if (!payload) throw new Error("Fichier de séquences/séances vide.");

    let sequences = [];
    let seances = [];

    if (Array.isArray(payload)) {
      if (payload.some(x => Array.isArray(x && x.seances))) {
        sequences = payload;
        payload.forEach(seq => (seq.seances || []).forEach(sea => {
          seances.push(Object.assign({}, sea, {
            sequence_id: sea.sequence_id || seq.id
          }));
        }));
      } else {
        seances = payload;
      }
    } else if (typeof payload === "object") {
      sequences = Array.isArray(payload.sequences)
        ? payload.sequences
        : Array.isArray(payload.planif_sequences)
          ? payload.planif_sequences
          : payload.sequence
            ? [payload.sequence]
            : [];
      seances = Array.isArray(payload.seances)
        ? payload.seances
        : Array.isArray(payload.planif_seances)
          ? payload.planif_seances
          : [];

      sequences.forEach(seq => (seq.seances || []).forEach(sea => {
        seances.push(Object.assign({}, sea, {
          sequence_id: sea.sequence_id || seq.id
        }));
      }));
    }

    const anciensSeq = JSON.parse(localStorage.getItem("planif_sequences") || "[]");
    const anciennesSea = JSON.parse(localStorage.getItem("planif_seances") || "[]");

    const fusion = (anciens, nouveaux) => {
      const map = new Map(anciens.filter(Boolean).map(x => [x.id, x]));
      nouveaux.filter(x => x && x.id).forEach(x => map.set(x.id, x));
      return Array.from(map.values());
    };

    const seqFinales = fusion(anciensSeq, sequences);
    const seaFinales = fusion(anciennesSea, seances);

    localStorage.setItem("planif_sequences", JSON.stringify(seqFinales));
    localStorage.setItem("planif_seances", JSON.stringify(seaFinales));

    return {
      sequences: sequences.filter(x => x && x.id).length,
      seances: seances.filter(x => x && x.id).length,
      totalSequences: seqFinales.length,
      totalSeances: seaFinales.length
    };
  }


  // ========================================================================
  // CALENDRIER
  // ========================================================================

  function estEnVacances(
    lundi,
    vendredi,
    vacances
  ) {

    return (
      vacances || []
    ).some(
      v => {

        const debut =
          parseISO(v.debut);

        const fin =
          parseISO(v.fin);


        return (
          lundi <= fin &&
          vendredi >= debut
        );

      }
    );

  }


  /**
   * Calcule les semaines de classe.
   */
  function calculerSemaines(
    config
  ) {

    const resultat = [];


    if (
      !config ||
      !config.rentree
    ) {

      return resultat;

    }


    let curseur =
      mondayOfWeek(
        parseISO(
          config.rentree
        )
      );


    const nb =
      config.semaines ||
      36;


    let garde =
      0;


    while (
      resultat.length < nb &&
      garde < nb + 30
    ) {

      garde++;


      const lundi =
        curseur;


      const vendredi =
        addDays(
          curseur,
          4
        );


      const vac =
        estEnVacances(
          lundi,
          vendredi,
          config.vacances
        );


      if (!vac) {

        resultat.push({

          numero:
            resultat.length + 1,

          lundi:
            lundi,

          vendredi:
            vendredi

        });

      }


      curseur =
        addDays(
          curseur,
          7
        );

    }


    return resultat;

  }


  // ========================================================================
  // GÉNÉRATION DES AFFECTATIONS
  // ========================================================================

  /**
   * Génère automatiquement les séances dans les créneaux correspondants.
   *
   * Les affectations marquées manuel:true sont conservées.
   */
  async function genererAffectations(
    classes,
    config,
    grilles,
    affectationsExistantes
  ) {

    const banque =
      await chargerBanque();


    const semaines =
      calculerSemaines(
        config
      );


    const affectations =
      JSON.parse(
        JSON.stringify(
          affectationsExistantes || {}
        )
      );


    classes.forEach(
      classe => {

        const niveau = classe.id; // clé de grilles/affectations = identifiant de la classe

        affectations[niveau] =
          affectations[niveau] ||
          {};


        const grille =
          (
            grilles[niveau] ||
            []
          )
          .filter(
            c =>
              c.type === "seance"
          );


        // --------------------------------------------------------------
        // Séances déjà utilisées manuellement
        // --------------------------------------------------------------

        const dejaUtilises =
          new Set();


        Object.entries(
          affectations[niveau]
        ).forEach(
          ([cle, aff]) => {

            if (
              aff &&
              aff.manuel &&
              aff.seanceId
            ) {

              dejaUtilises.add(
                aff.seanceId
              );

            }

          }
        );


        // --------------------------------------------------------------
        // Curseurs
        // --------------------------------------------------------------

        const curseurs = {};


        function prochaineSeance(
          domaineCle
        ) {

          const bucket =
            (
              banque[classe.niveau] &&
              banque[classe.niveau][domaineCle]
            ) ||
            {
              items: []
            };


          if (
            curseurs[domaineCle] ===
            undefined
          ) {

            curseurs[domaineCle] =
              0;

          }


          while (
            curseurs[domaineCle] <
            bucket.items.length
          ) {

            const it =
              bucket.items[
                curseurs[domaineCle]
              ];


            curseurs[domaineCle]++;


            if (
              !dejaUtilises.has(
                it.id
              )
            ) {

              dejaUtilises.add(
                it.id
              );

              return it;

            }

          }


          return null;

        }


        // --------------------------------------------------------------
        // Parcours des semaines
        // --------------------------------------------------------------

        semaines.forEach(
          sem => {

            JOURS.forEach(
              j => {

                const jourDate =
                  addDays(
                    sem.lundi,
                    j.n - 1
                  );


                const iso =
                  dateISO(
                    jourDate
                  );


                grille
                  .filter(
                    c =>
                      c.jour === j.n
                  )
                  .sort(
                    (a, b) =>
                      heureVersMin(a.debut) -
                      heureVersMin(b.debut)
                  )
                  .forEach(
                    creneau => {

                      const cle =
                        cleCreneau(
                          iso,
                          creneau.id
                        );


                      const existant =
                        affectations[niveau][cle];


                      // Une modification manuelle ne doit jamais être
                      // écrasée par la génération automatique.

                      if (
                        existant &&
                        existant.manuel
                      ) {

                        return;

                      }


                      const seance =
                        prochaineSeance(
                          creneau.domaineCle
                        );


                      if (seance) {

                        affectations[niveau][cle] = {

                          seanceId:
                            seance.id,

                          source:
                            seance.source,

                          fichier:
                            seance.fichier ||
                            null,

                          domaineCle:
                            creneau.domaineCle,

                          manuel:
                            false

                        };

                      }
                      else {

                        affectations[niveau][cle] = {

                          seanceId:
                            null,

                          domaineCle:
                            creneau.domaineCle,

                          manuel:
                            false

                        };

                      }

                    }
                  );

              }
            );

          }
        );

      }
    );


    return affectations;

  }


  // ========================================================================
  // API PUBLIQUE
  // ========================================================================

  global.PlanningCore = {

    // Constantes
    NIVEAUX,
    JOURS,
    TYPES_CRENEAU,
    TYPES_ADULTE,

    // Stockage
    STORE_CONFIG,
    STORE_GRILLES,
    STORE_AFFECT,
    STORE_JOURNAL,

    // Utilitaires
    slug,
    uid,
    parseNumero,
    dateISO,
    parseISO,
    addDays,
    mondayOfWeek,
    formatDateLong,
    formatDateShort,
    heureVersMin,

    // Banque
    chargerBanque,
    chargerDerouleDeItem,
    importerBibliothequeJSON,

    // Configuration
    chargerConfig,
    sauverConfig,
    exporterConfigJSON,
    importerConfigJSON,

    // Classes (configuration générale)
    NIVEAUX_DISPONIBLES,
    PALETTE_CLASSES,
    chargerClasses,
    creerClasse,
    supprimerClasse,
    classeById,
    classesDuService,

    // Grilles
    chargerGrilles,
    sauverGrilles,
    appliquerCreneauxFixes,

    // Affectations
    chargerAffectations,
    sauverAffectations,

    // Calendrier
    cleCreneau,
    calculerSemaines,

    // Génération
    genererAffectations,

    // Cahier journal
    chargerJournal,
    sauverJournal,
    journalPourDate,
    cleBloc,
    regrouperParBloc,
    libelleBloc,
    genererJournalDepuisGrille,
    repartirElevesAuto,
    repartirElevesSemaineAuto,

    // Import / export JSON
    exporterPlanningJSON,
    telechargerPlanningJSON,
    lireFichierJSON,
    appliquerPaquetPlanning,

    // Clé USB
    connecterDossierUSB,
    dossierUSBConnecte,
    obtenirDossierUSB,
    ecrireJSONUSB,
    lireJSONUSB,
    sauverPlanningUSB,
    chargerPlanningUSB

  };


})(window);
