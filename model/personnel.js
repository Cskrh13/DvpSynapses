/**
 * Synapses 2.0 — model/personnel.js
 * Contrat : identifiant + rôle(s), nom affiché en clair (décision actée :
 * les noms d'adultes restent publics, jamais transmis à un moteur d'IA).
 * Toute donnée personnelle allant au-delà du nom/rôle affiché reste hors de
 * ce modèle, du ressort exclusif du Coffre si elle existe un jour.
 */
(function (global) {
  "use strict";
  const { Entite } = global.SynapsesModel;

  class Personnel extends Entite {
    constructor(donnees) {
      super(donnees, ["id", "roleIds"]);
      this.nom = donnees.nom || null;
      this.roleIds = donnees.roleIds;
      this.classeIds = donnees.classeIds || [];
      this.dispositifIds = donnees.dispositifIds || [];
    }

    static fromJSON(donnees) {
      return new Personnel(donnees);
    }

    aleRole(roleId) {
      return this.roleIds.includes(roleId);
    }
  }

  global.SynapsesModel.Personnel = Personnel;
})(typeof window !== "undefined" ? window : globalThis);
