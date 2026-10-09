
/** The four pregenerated characters from Appendix L, as character data plus items. */
const SK = (o) => ({ combat: 0, athletics: 0, stealth: 0, investigation: 0, technology: 0, medicine: 0, persuasion: 0, deception: 0, empathy: 0, streetwise: 0, corporate: 0, fixer: 0, ...o });
const RES = (o) => ({ wrath: 0, lust: 0, sloth: 0, gluttony: 0, gloom: 0, pride: 0, envy: 0, ...o });

export const PREGENS = [
  {
    name: "Wren Okoro",
    system: {
      concept: "A Backstreets medic who used to work Wing security.", identity: "The one who fixes people, not machines.",
      occupation: "Backstreets Medic (unlicensed)", affiliation: "Mutual-aid network (Threadmill Row clinic)", background: "Raised in the Row",
      burden: "A Wing guard bled out in her arms during a night shift after she waited for a supervisor's sign-off.",
      fear: "Dying without anyone knowing what happened to me.", boundary: "I won't let someone die on my table because I hesitated.",
      vice: "Can't say no to a patient, even when it's obviously a trap.", desire: "Open a real clinic with a door that locks and a license on the wall.",
      principle: "Everyone gets one honest chance to be helped.", ambition: "Is a clean conscience something the City lets you keep?",
      attributes: { body: 2, mind: 2, presence: 2, resolve: 4 },
      skills: SK({ combat: 1, athletics: 1, stealth: 1, investigation: 1, technology: 1, medicine: 3, persuasion: 1, empathy: 2, streetwise: 2 }),
      ego: { value: 4, max: 4 }, stress: 1, resources: 2, grade: 9, resonance: RES({ lust: 1, sloth: 2, gloom: 3 })
    },
    items: [
      { name: "Rain Cape", type: "gear", system: { kind: "suit", sin: "gloom", cost: 2, description: "The weather follows you." } },
      { name: "Old Tabbi", type: "bond", system: { type: "affection", strength: 2, person: "Old Tabbi, who runs the Row clinic and took her in" } },
      { name: "Mutual-aid network", type: "bond", system: { type: "obligation", strength: 1, person: "The mutual-aid network (she owes them shifts)" } },
      { name: "Waiting for the sign-off", type: "trauma", system: { trigger: "A patient is dying and someone makes her wait for permission.", reaction: "Her hands go very still before she acts." } }
    ]
  },
  {
    name: "Dax Verrin",
    system: {
      concept: "A former Syndicate collector who now takes honest work, mostly.", identity: "Someone who finishes what he starts.",
      occupation: "Syndicate Member (ex)", affiliation: "Gantry & Sons, a small Office", background: "Syndicate kid from the Backstreets",
      burden: "He once broke a debtor's hands on orders, and the debtor was a kid covering for his father.",
      fear: "Becoming the thing he used to collect for.", boundary: "I won't hurt someone who can't hit back.",
      vice: "Pride: can't walk away from a challenge in front of an audience.", desire: "Clear the Debt he still owes his old crew without going back to them.",
      principle: "A deal is a deal.", ambition: "Can a man like me be trusted by anyone?",
      attributes: { body: 4, mind: 1, presence: 3, resolve: 2 },
      skills: SK({ combat: 3, athletics: 2, stealth: 1, investigation: 1, persuasion: 2, deception: 1, streetwise: 2, fixer: 1 }),
      ego: { value: 2, max: 2 }, stress: 1, resources: 2, grade: 9, resonance: RES({ wrath: 3, pride: 2, envy: 1 })
    },
    items: [
      { name: "Ember Knife", type: "gear", system: { kind: "weapon", sin: "wrath", cost: 2, description: "A blade that never quite cools." } },
      { name: "Marl Vessey", type: "bond", system: { type: "debt", strength: 2, person: "Marl Vessey, his old crew boss" } },
      { name: "Gantry & Sons", type: "bond", system: { type: "obligation", strength: 1, person: "Gantry & Sons (quotas and cuts)" } },
      { name: "A debtor's hands", type: "trauma", system: { trigger: "He is asked to hurt someone who can't fight back.", reaction: "His left hand starts to shake and he hides it." } }
    ]
  },
  {
    name: "Lena Hart",
    system: {
      concept: "A Wing researcher who started asking questions about her own department.", identity: "The one who reads the footnotes.",
      occupation: "Wing Researcher", affiliation: "Halcyon Wing (Employment Bond)", background: "Born inside Wing housing; never lived anywhere else",
      burden: "A colleague vanished after sharing a data request with her; she signed off on the 'reassignment'.",
      fear: "Learning she was complicit all along.", boundary: "I won't destroy evidence, even to protect myself.",
      vice: "Curiosity: will open the file she was told not to.", desire: "Find out what her Wing's treatment is actually made from.",
      principle: "Information is a kind of mercy.", ambition: "What is the City built on?",
      attributes: { body: 1, mind: 4, presence: 2, resolve: 3 },
      skills: SK({ stealth: 1, investigation: 2, technology: 3, medicine: 1, persuasion: 1, deception: 1, streetwise: 1, corporate: 2, fixer: 1 }),
      ego: { value: 3, max: 3 }, stress: 1, resources: 2, grade: 9, resonance: RES({ gluttony: 3, gloom: 1, pride: 2 })
    },
    items: [
      { name: "Appetite Ledger", type: "gear", system: { kind: "tool", sin: "gluttony", cost: 2, description: "Investigation, Streetwise or Corporate Knowledge." } },
      { name: "Pell", type: "bond", system: { type: "trust", strength: 2, person: "Pell, a lab technician who covers for her" } },
      { name: "Halcyon Wing", type: "bond", system: { type: "obligation", strength: 1, person: "Halcyon Wing (Employment; Wing Support applies)" } },
      { name: "The signed reassignment", type: "trauma", system: { trigger: "She is asked to approve a transfer without seeing why.", reaction: "She re-reads the form three times." } }
    ]
  },
  {
    name: "Tomas Quill",
    system: {
      concept: "An independent investigator who sells answers to people who can't afford them.", identity: "The one who asks the second question.",
      occupation: "Independent Investigator", affiliation: "None (freelance, known to a few Offices)", background: "Ex-clerk who got tired of filing other people's lies",
      burden: "His report cleared the wrong man, and the man was executed by a Syndicate before the correction came.",
      fear: "Being right and not mattering.", boundary: "I won't lie to a client about what I found.",
      vice: "Needs to be right: will push a point past the point of safety.", desire: "Get his license back and his name off a Wing blacklist.",
      principle: "Everyone is telling the truth from where they stand.", ambition: "Can the truth survive in the City?",
      attributes: { body: 2, mind: 3, presence: 3, resolve: 2 },
      skills: SK({ athletics: 1, stealth: 1, investigation: 3, technology: 1, persuasion: 2, deception: 2, empathy: 2, streetwise: 1 }),
      ego: { value: 2, max: 2 }, stress: 1, resources: 2, grade: 9, resonance: RES({ wrath: 1, pride: 3, envy: 2 })
    },
    items: [
      { name: "Skeleton Keys", type: "gear", system: { kind: "tool", sin: "envy", cost: 2, description: "Deception, Stealth or Technology." } },
      { name: "Hale", type: "bond", system: { type: "trust", strength: 2, person: "Hale, his one reliable informant" } },
      { name: "Gantry & Sons dispatcher", type: "bond", system: { type: "debt", strength: 1, person: "A favor owed to a Gantry & Sons dispatcher" } },
      { name: "The wrong man", type: "trauma", system: { trigger: "A correction arrives too late.", reaction: "He keeps checking his notes, again." } }
    ]
  }
];


/** Spanish pregenerated characters (the same four, with Spanish text), used when the app is set to Spanish. */
export const PREGENS_ES = [
  {
    name: "Wren Okoro",
    text: {"concept": "Una médica de los Callejones que antes trabajó en seguridad de un Ala.", "identity": "La que arregla personas, no máquinas.", "occupation": "Médica de los Callejones (sin licencia)", "affiliation": "Red de ayuda mutua (clínica de la Fila Threadmill)", "background": "Criada en la Fila", "burden": "Un guardia del Ala se desangró en sus brazos durante un turno de noche mientras ella esperaba la firma de un supervisor.", "fear": "Morir sin que nadie sepa lo que me pasó.", "boundary": "No dejaré que alguien muera en mi mesa porque dudé.", "vice": "No puede decir que no a un paciente, aunque sea obviamente una trampa.", "desire": "Abrir una clínica de verdad, con una puerta que cierre y una licencia en la pared.", "principle": "Todo el mundo merece una oportunidad honesta de recibir ayuda.", "ambition": "¿Es una conciencia limpia algo que la Ciudad te deja conservar?"},
    items: [{"name": "Capa de Lluvia", "type": "gear", "system": {"kind": "suit", "sin": "gloom", "cost": 2, "description": "El tiempo te sigue."}}, {"name": "Vieja Tabbi", "type": "bond", "system": {"type": "affection", "strength": 2, "person": "La vieja Tabbi, que lleva la clínica de la Fila y la acogió"}}, {"name": "Red de ayuda mutua", "type": "bond", "system": {"type": "obligation", "strength": 1, "person": "La red de ayuda mutua (les debe turnos)"}}, {"name": "Esperar la firma", "type": "trauma", "system": {"trigger": "Un paciente se muere y alguien la hace esperar un permiso.", "reaction": "Sus manos se quedan muy quietas antes de actuar."}}]
  },
  {
    name: "Dax Verrin",
    text: {"concept": "Un antiguo cobrador de un Sindicato que ahora acepta trabajo honrado, casi siempre.", "identity": "Alguien que termina lo que empieza.", "occupation": "Miembro de Sindicato (ex)", "affiliation": "Gantry e Hijos, una Oficina pequeña", "background": "Chico de Sindicato de los Callejones", "burden": "Una vez rompió las manos de un deudor por orden de su jefe, y el deudor era un chico que cubría a su padre.", "fear": "Convertirse en aquello para lo que cobraba.", "boundary": "No haré daño a quien no pueda devolver el golpe.", "vice": "Orgullo: no puede alejarse de un desafío delante de un público.", "desire": "Saldar la Deuda que aún tiene con su antigua banda sin volver con ellos.", "principle": "Un trato es un trato.", "ambition": "¿Puede alguien como yo ser de fiar para alguien?"},
    items: [{"name": "Cuchillo de Brasas", "type": "gear", "system": {"kind": "weapon", "sin": "wrath", "cost": 2, "description": "Una hoja que nunca se enfría del todo."}}, {"name": "Marl Vessey", "type": "bond", "system": {"type": "debt", "strength": 2, "person": "Marl Vessey, el jefe de su antigua banda"}}, {"name": "Gantry e Hijos", "type": "bond", "system": {"type": "obligation", "strength": 1, "person": "Gantry e Hijos (cuotas y recortes)"}}, {"name": "Las manos de un deudor", "type": "trauma", "system": {"trigger": "Le piden que haga daño a alguien que no puede defenderse.", "reaction": "Le tiembla la mano izquierda y la esconde."}}]
  },
  {
    name: "Lena Hart",
    text: {"concept": "Una investigadora de un Ala que empezó a hacer preguntas sobre su propio departamento.", "identity": "La que lee las notas al pie.", "occupation": "Investigadora de un Ala", "affiliation": "Ala Halcyon (Vínculo de Empleo)", "background": "Nació dentro de la vivienda del Ala; nunca ha vivido en otro sitio", "burden": "Un colega desapareció tras compartir con ella una petición de datos; ella firmó la 'reasignación'.", "fear": "Descubrir que fue cómplice desde el principio.", "boundary": "No destruiré pruebas, ni siquiera para protegerme.", "vice": "Curiosidad: abrirá el expediente que le dijeron que no abriera.", "desire": "Averiguar de qué está hecho en realidad el tratamiento de su Ala.", "principle": "La información es una forma de misericordia.", "ambition": "¿Sobre qué está construida la Ciudad?"},
    items: [{"name": "Libro de Apetitos", "type": "gear", "system": {"kind": "tool", "sin": "gluttony", "cost": 2, "description": "Investigación, Callejeo o Conocimiento Corporativo."}}, {"name": "Pell", "type": "bond", "system": {"type": "trust", "strength": 2, "person": "Pell, un técnico de laboratorio que la cubre"}}, {"name": "Ala Halcyon", "type": "bond", "system": {"type": "obligation", "strength": 1, "person": "Ala Halcyon (Empleo; se aplica el Apoyo del Ala)"}}, {"name": "La reasignación firmada", "type": "trauma", "system": {"trigger": "Le piden aprobar un traslado sin ver por qué.", "reaction": "Relee el formulario tres veces."}}]
  },
  {
    name: "Tomas Quill",
    text: {"concept": "Un investigador independiente que vende respuestas a gente que no puede permitírselas.", "identity": "El que hace la segunda pregunta.", "occupation": "Investigador independiente", "affiliation": "Ninguna (freelance, conocido en unas pocas Oficinas)", "background": "Antiguo oficinista harto de archivar las mentiras de otros", "burden": "Su informe exculpó al hombre equivocado, y un Sindicato lo ejecutó antes de que llegara la corrección.", "fear": "Tener razón y no importar.", "boundary": "No mentiré a un cliente sobre lo que encontré.", "vice": "Necesita tener razón: llevará un punto más allá de lo seguro.", "desire": "Recuperar su licencia y que su nombre salga de la lista negra de un Ala.", "principle": "Todos dicen la verdad desde donde están.", "ambition": "¿Puede sobrevivir la verdad en la Ciudad?"},
    items: [{"name": "Ganzúas", "type": "gear", "system": {"kind": "tool", "sin": "envy", "cost": 2, "description": "Engaño, Sigilo o Tecnología."}}, {"name": "Hale", "type": "bond", "system": {"type": "trust", "strength": 2, "person": "Hale, su único informante fiable"}}, {"name": "Despachador de Gantry e Hijos", "type": "bond", "system": {"type": "debt", "strength": 1, "person": "Un favor que debe a un despachador de Gantry e Hijos"}}, {"name": "El hombre equivocado", "type": "trauma", "system": {"trigger": "Llega una corrección demasiado tarde.", "reaction": "Vuelve a revisar sus notas, otra vez."}}]
  },
];
