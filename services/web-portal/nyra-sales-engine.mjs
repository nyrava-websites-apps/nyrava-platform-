// Nyrava Nyra AI Sales Bot & Tour Engine
// Implements the public sales API for Nyra (/api/nyra/v1/*)

export const NYRA_CONFIG = {
  enabled: true,
  product: "Nyrava Home",
  registration: "http://localhost:5180",
  tour: ["intro", "leads", "crm", "teams", "plans", "valuation", "territories", "meet"],
  topics: [
    { id: "intro", label: { en: "Welcome", es: "Bienvenida" } },
    { id: "leads", label: { en: "Lead generation", es: "Prospectos" } },
    { id: "crm", label: { en: "Realtor CRM", es: "CRM Inmobiliario" } },
    { id: "teams", label: { en: "Team Tools", es: "Herramientas de equipo" } },
    { id: "plans", label: { en: "Plans & Pricing", es: "Planes y precios" } },
    { id: "valuation", label: { en: "Home Valuation", es: "Valoración de casa" } },
    { id: "territories", label: { en: "Territory Model", es: "Modelo territorial" } },
    { id: "meet", label: { en: "Video Meet", es: "Reuniones de video" } },
    { id: "ai", label: { en: "AI Assistance", es: "Asistencia de IA" } },
    { id: "privacy", label: { en: "Privacy & Consent", es: "Privacidad y consentimiento" } },
    { id: "guarantees", label: { en: "Guarantees", es: "Garantías" } },
    { id: "workflow", label: { en: "Daily Workflow", es: "Flujo de trabajo diario" } },
    { id: "calendar", label: { en: "Calendar & Schedule", es: "Calendario y citas" } },
    { id: "contact", label: { en: "Support & Contact", es: "Contacto y soporte" } }
  ]
};

export const NYRA_RESPONSES = {
  intro: {
    en: {
      text: "Welcome to Nyrava Home! I'm Nyra, your real estate intelligence guide. We help licensed Realtors and their teams find verified local buyer and seller opportunities across 60 US metro markets, organize follow-ups, and grow their business in one connected platform.",
      href: "/lead-generation.html",
      selector: "#nyra-home-intro"
    },
    es: {
      text: "¡Bienvenido a Nyrava Home! Soy Nyra, tu guía de inteligencia inmobiliaria. Ayudamos a agentes con licencia y sus equipos a encontrar oportunidades verificadas de compradores y vendedores en 60 mercados de EE. UU.",
      href: "/lead-generation.html",
      selector: "#nyra-home-intro"
    }
  },
  leads: {
    en: {
      text: "Nyrava Home identifies motivated buyer and seller opportunities in your market. Each inquiry requires contact verification, current buying or selling intent, and clear consumer permission before delivery to your territory.",
      href: "/lead-generation.html",
      selector: "#lead-generation"
    },
    es: {
      text: "Nyrava Home identifica oportunidades motivadas de compradores y vendedores. Cada consulta requiere verificación de contacto, intención actual de compra o venta y consentimiento previo.",
      href: "/lead-generation.html",
      selector: "#lead-generation"
    }
  },
  crm: {
    en: {
      text: "Our dedicated Realtor CRM gives your team one place to triage prospects, manage your pipeline, track communications, and schedule client appointments with automated territory assignment.",
      href: "http://localhost:5180",
      selector: "#realtor-tools"
    },
    es: {
      text: "Nuestro CRM inmobiliario ofrece a tu equipo un espacio único para organizar prospectos, dar seguimiento a citas y gestionar oportunidades territoriales.",
      href: "http://localhost:5180",
      selector: "#realtor-tools"
    }
  },
  teams: {
    en: {
      text: "Collaborate seamlessly with your entire team. Assign incoming leads, manage shared calendars, coordinate follow-up tasks, and conduct internal team messaging in real time.",
      href: "/ai-team-tools.html",
      selector: "#realtor-tools"
    },
    es: {
      text: "Colabora fácilmente con tu equipo. Asigna prospectos entrantes, coordina tareas de seguimiento y mantén comunicación directa.",
      href: "/ai-team-tools.html",
      selector: "#realtor-tools"
    }
  },
  plans: {
    en: {
      text: "Our platform pricing is straightforward: a $349 USD annual license includes your first month of service. Monthly service begins in month two: choose Basic at $89/month (up to 5 ZIPs) or Pro at $149/month (up to 20 ZIPs).",
      href: "/#pricing",
      selector: "#pricing"
    },
    es: {
      text: "Precios transparentes: una licencia anual de $349 USD que incluye tu primer mes de servicio. A partir del segundo mes: Plan Basic a $89/mes (hasta 5 códigos postales) o Plan Pro a $149/mes (hasta 20 códigos).",
      href: "/#pricing",
      selector: "#pricing"
    }
  },
  valuation: {
    en: {
      text: "Homeowners can request an instant property valuation report. Our 50-state AVM engine calculates market price, local comps, and 3-year equity growth, routing qualified inquiries directly to subscribed Realtors.",
      href: "/home-value-reports.html",
      selector: "#how-it-works"
    },
    es: {
      text: "Los propietarios pueden solicitar un informe de valoración instantáneo basado en ventas comparables recientes y proyecciones de plusvalía a 3 años.",
      href: "/home-value-reports.html",
      selector: "#how-it-works"
    }
  },
  territories: {
    en: {
      text: "Territories are exclusive by 5-digit ZIP code. Each delivered lead is routed exclusively to one subscribing business at a time, ensuring you never compete with other agents on Nyrava opportunities.",
      href: "/#zip-availability",
      selector: "#zip-availability"
    },
    es: {
      text: "Los territorios son exclusivos por código postal de 5 dígitos. Cada cliente potencial se entrega exclusivamente a una agencia a la vez.",
      href: "/#zip-availability",
      selector: "#zip-availability"
    }
  },
  meet: {
    en: {
      text: "Nyra Meet enables encrypted HD video consultations directly from your browser. Present property valuation reports, review comps, and consult with buyers and sellers face-to-face without third-party downloads.",
      href: "http://localhost:5000",
      selector: "#realtor-tools"
    },
    es: {
      text: "Nyra Meet permite videollamadas privadas en alta definición directamente desde el navegador para consultar con clientes sin descargar aplicaciones.",
      href: "http://localhost:5000",
      selector: "#realtor-tools"
    }
  },
  ai: {
    en: {
      text: "Nyra AI assists your team with drafting sales call talking points, summarizing property inquiries, and preparing responsive email and text drafts to accelerate client conversations.",
      href: "/ai-team-tools.html",
      selector: "#realtor-tools"
    },
    es: {
      text: "Nyra IA asiste a tu equipo redactando puntos clave para llamadas de venta, resumiendo solicitudes de propiedades y preparando borradores de correo.",
      href: "/ai-team-tools.html",
      selector: "#realtor-tools"
    }
  },
  privacy: {
    en: {
      text: "Privacy and consent come first. Every homeowner email includes a 1-click opt-out link, and all inquiries require explicit consumer authorization before delivery.",
      href: "/privacy.html",
      selector: "#how-it-works"
    },
    es: {
      text: "La privacidad y el consentimiento son primordiales. Cada correo incluye opción de exclusión en un clic y autorización explícita.",
      href: "/privacy.html",
      selector: "#how-it-works"
    }
  },
  guarantees: {
    en: {
      text: "Nyrava Home provides verified consumer intent and territory data, but cannot guarantee specific lead volume, closed sales, or transaction timing. Performance depends on local market momentum and individual Realtor follow-up.",
      href: "/#pricing",
      selector: "#pricing"
    },
    es: {
      text: "Nyrava Home proporciona datos de intención verificada, pero no garantiza volumen de ventas cerrado. Los resultados dependen del mercado local.",
      href: "/#pricing",
      selector: "#pricing"
    }
  },
  workflow: {
    en: {
      text: "Start your day in your Realtor workspace: review new territory inquiries in your Master Bank, move deals through your visual pipeline, set client appointments, and monitor team activity.",
      href: "http://localhost:5180",
      selector: "#realtor-tools"
    },
    es: {
      text: "Comienza tu día en tu espacio de trabajo: revisa prospectos en el Banco Maestro, avanza tratos en el embudo visual y programa citas.",
      href: "http://localhost:5180",
      selector: "#realtor-tools"
    }
  },
  calendar: {
    en: {
      text: "Manage appointments, property tours, and follow-up deadlines with integrated calendar synchronization and personal reminders.",
      href: "http://localhost:5180",
      selector: "#realtor-tools"
    },
    es: {
      text: "Administra citas, visitas a propiedades y recordatorios personales con sincronización de calendario.",
      href: "http://localhost:5180",
      selector: "#realtor-tools"
    }
  },
  contact: {
    en: {
      text: "Our team is here to help you scale your real estate business. You can reach our support team anytime at support@home.nyrava.com.",
      href: "/contact.html",
      selector: "#main-nav"
    },
    es: {
      text: "Nuestro equipo está aquí para apoyarte. Puedes escribirnos en cualquier momento a support@home.nyrava.com.",
      href: "/contact.html",
      selector: "#main-nav"
    }
  }
};

export function resolveTopic(question = "") {
  const q = question.toLowerCase();
  if (/lead|prospect|buyer|seller|inquir/i.test(q)) return "leads";
  if (/crm|pipeline|contact|triage|workspace/i.test(q)) return "crm";
  if (/plan|price|cost|fee|month|subscription|basic|pro|349|89|149/i.test(q)) return "plans";
  if (/value|worth|valuation|estimate|comp|equity/i.test(q)) return "valuation";
  if (/territor|zip|area|exclusive|coverage/i.test(q)) return "territories";
  if (/meet|video|call|camera|conference|nyra meet/i.test(q)) return "meet";
  if (/team|member|employee|staff|assign/i.test(q)) return "teams";
  if (/guarantee|promise|close|assure/i.test(q)) return "guarantees";
  if (/privacy|opt|consent|tcpa|safe/i.test(q)) return "privacy";
  if (/calendar|schedule|appointment|reminder/i.test(q)) return "calendar";
  if (/contact|email|support|help|phone/i.test(q)) return "contact";
  return "intro";
}
