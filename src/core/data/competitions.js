export const competitions = [
  {
    id: "colombia-primera-a",
    name: "Liga BetPlay Dimayor",
    country: "Colombia",
    division: "Primera A",
    aliases: [
      "liga betplay",
      "betplay",
      "liga colombiana",
      "primera a colombia",
      "fpc",
      "futbol profesional colombiano",
      "fútbol profesional colombiano"
    ],
    teams: [
      {
        name: "América de Cali",
        aliases: ["america", "américa", "america de cali", "américa de cali"]
      },
      {
        name: "Millonarios",
        aliases: ["millonarios", "millonarios fc"]
      },
      {
        name: "Inter Bogotá",
        aliases: [
          "inter bogota",
          "inter bogotá",
          "inter de bogota",
          "inter de bogotá",
          "internacional de bogota",
          "internacional de bogotá",
          "internacional bogota",
          "internacional bogotá"
        ]
      },
      {
        name: "Atlético Nacional",
        aliases: ["atletico nacional", "atlético nacional", "nacional"]
      },
      {
        name: "Independiente Medellín",
        aliases: ["independiente medellin", "independiente medellín", "medellin", "medellín"]
      },
      {
        name: "Deportivo Cali",
        aliases: ["deportivo cali", "cali"]
      },
      {
        name: "Santa Fe",
        aliases: ["santa fe", "independiente santa fe"]
      },
      {
        name: "Junior",
        aliases: ["junior", "junior barranquilla"]
      },
      {
        name: "Once Caldas",
        aliases: ["once caldas"]
      },
      {
        name: "Deportes Tolima",
        aliases: ["deportes tolima", "tolima"]
      },
      {
        name: "Deportivo Pereira",
        aliases: ["deportivo pereira", "pereira"]
      },
      {
        name: "Deportivo Pasto",
        aliases: ["deportivo pasto", "pasto"]
      },
      {
        name: "Envigado",
        aliases: ["envigado"]
      },
      {
        name: "Boyacá Chicó",
        aliases: ["boyaca chico", "boyacá chicó", "chico", "chicó"]
      },
      {
        name: "Águilas Doradas",
        aliases: ["aguilas doradas", "águilas doradas"]
      },
      {
        name: "Fortaleza",
        aliases: ["fortaleza", "fortaleza ceif"]
      },
      {
        name: "Llaneros",
        aliases: ["llaneros"]
      },
      {
        name: "Unión Magdalena",
        aliases: ["union magdalena", "unión magdalena"]
      },
      {
        name: "Alianza",
        aliases: ["alianza", "alianza fc"]
      }
    ]
  },
  {
    id: "colombia-primera-b",
    name: "Torneo BetPlay Dimayor",
    country: "Colombia",
    division: "Primera B",
    aliases: [
      "torneo betplay",
      "primera b colombia",
      "segunda division colombia",
      "segunda división colombia"
    ],
    teams: [
      {
        name: "Real Cartagena",
        aliases: ["real cartagena"]
      },
      {
        name: "Cúcuta Deportivo",
        aliases: ["cucuta", "cúcuta", "cucuta deportivo", "cúcuta deportivo"]
      },
      {
        name: "Atlético Huila",
        aliases: ["atletico huila", "atlético huila", "huila"]
      },
      {
        name: "Internacional de Palmira",
        aliases: [
          "internacional de palmira",
          "inter palmira",
          "internacional palmira",
          "internacional fc"
        ]
      },
      {
        name: "Bogotá FC",
        aliases: ["bogota fc", "bogotá fc"]
      },
      {
        name: "Tigres",
        aliases: ["tigres", "tigres fc"]
      },
      {
        name: "Boca Juniors de Cali",
        aliases: ["boca juniors de cali", "boca juniors cali"]
      },
      {
        name: "Leones",
        aliases: ["leones", "leones fc"]
      },
      {
        name: "Barranquilla",
        aliases: ["barranquilla", "barranquilla fc"]
      },
      {
        name: "Real Santander",
        aliases: ["real santander"]
      },
      {
        name: "Orsomarso",
        aliases: ["orsomarso"]
      },
      {
        name: "Deportes Quindío",
        aliases: ["deportes quindio", "deportes quindío", "quindio", "quindío"]
      }
    ]
  }
];

export function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
