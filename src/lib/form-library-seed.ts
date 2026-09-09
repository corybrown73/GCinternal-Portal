/**
 * The form library's starting contents: the forms each industry we serve
 * actually runs, by name, with the objective of each.
 *
 * WHAT THIS IS. Not form definitions — those live in GoCanvas, where they
 * can be published. This is the catalogue the onboarding conversation starts
 * from: "which of these is closest to what you do today?" A name and an
 * objective are enough for a customer to point at one. Pictures are added
 * from the library page as they are made.
 *
 * WHERE THE NAMES COME FROM. GoCanvas's own template categories (inspections
 * and surveys, oil & gas work orders, utilities and energy), the daily
 * forms construction and roofing crews already carry (daily report, JSA,
 * toolbox talk), API-practice well-site inspections, HVAC service and
 * start-up checklists, utility pole/substation/outage forms, and EPA
 * chain-of-custody for environmental sampling. Each was checked against
 * what the vertical's own field-software vendors ship, so a customer hears
 * their own vocabulary rather than ours.
 *
 * Six per industry, roughly in the order a new customer adopts them: the
 * daily form first, then safety, then inspection, then the ones that feed
 * the office.
 */

export type FormLibraryEntry = {
  name: string;
  /** The objective — what the form is for, in one or two sentences. */
  description: string;
  tags: string[];
};

export const FORM_LIBRARY_SEED: Record<string, FormLibraryEntry[]> = {
  Construction: [
    {
      name: "Daily Field Report",
      description:
        "One record per crew per day: work performed, headcount by trade, equipment on site, materials used, weather, delays and visitors. The form the office waits for every evening.",
      tags: ["daily", "photos", "signature", "weather"],
    },
    {
      name: "Job Safety Analysis (JSA)",
      description:
        "Break the day's task into steps, name the hazard in each and the control for it, and get the crew's sign-off before work starts. The record OSHA asks for after an incident.",
      tags: ["safety", "pre-task", "signature", "OSHA"],
    },
    {
      name: "Toolbox Talk Attendance",
      description:
        "Topic, presenter, duration and every attendee's signature. Proves the safety conversation happened and who was in it.",
      tags: ["safety", "attendance", "signature"],
    },
    {
      name: "Site Safety Inspection",
      description:
        "Walk the site against a checklist: PPE, fall protection, housekeeping, electrical, fire, excavation. Photograph anything failed and assign it to somebody.",
      tags: ["safety", "inspection", "photos", "corrective action"],
    },
    {
      name: "Equipment Pre-Use Inspection",
      description:
        "Operator checks a machine before the shift — fluids, brakes, lights, guards, leaks — and tags it out if it fails. One form per machine per day.",
      tags: ["equipment", "daily", "pre-use", "tag-out"],
    },
    {
      name: "Incident / Near-Miss Report",
      description:
        "What happened, where, who was involved, photos, witnesses and immediate action taken. Filed within the shift, while the details are still true.",
      tags: ["safety", "incident", "photos", "GPS"],
    },
  ],

  "Oil & Gas": [
    {
      name: "Well Site Inspection",
      description:
        "Lease walk against API practice: tanks, separators, gauges, thief hatches, relief valves, berms, signage. Readings and photos per item, with anything out of spec flagged for the pumper.",
      tags: ["inspection", "API", "photos", "readings"],
    },
    {
      name: "Job Safety Analysis (JSA)",
      description:
        "Task steps, hazards, controls and crew sign-off before any job on location. Required before hot work, confined space or pressure work begins.",
      tags: ["safety", "pre-task", "signature"],
    },
    {
      name: "Field Service Ticket",
      description:
        "The billable record of a job: customer, lease, work performed, hours, equipment and consumables, with the company man's signature. What the invoice is built from.",
      tags: ["ticket", "billing", "signature", "hours"],
    },
    {
      name: "Tank Gauging & Run Ticket",
      description:
        "Opening and closing gauges, temperature, BS&W and gravity for each tank, producing the run ticket that moves oil off the lease.",
      tags: ["production", "readings", "run ticket"],
    },
    {
      name: "Pressure Test Record",
      description:
        "Test pressure, hold time, start and end readings and pass/fail for each segment or component, with a chart photo. The document a regulator asks to see.",
      tags: ["pressure test", "compliance", "readings", "photos"],
    },
    {
      name: "Spill / Release Report",
      description:
        "Volume, product, location, cause and containment steps, timestamped and geotagged, with photos. Captures what the agency report will need before anyone has to remember it.",
      tags: ["environmental", "incident", "GPS", "photos"],
    },
  ],

  Utilities: [
    {
      name: "Pole Inspection",
      description:
        "Condition of each pole on a route: lean, rot, hardware, attachments, clearances, ground line. Geotagged with photos so the next crew finds the same pole.",
      tags: ["inspection", "GPS", "photos", "route"],
    },
    {
      name: "Substation Inspection",
      description:
        "Monthly walk of transformers, breakers, batteries, oil levels, gauges and grounds. Readings recorded per asset and compared against the last visit.",
      tags: ["inspection", "readings", "monthly", "asset"],
    },
    {
      name: "Outage / Trouble Report",
      description:
        "Cause, extent, damage found and restoration steps, timestamped as the work happens. Feeds the reliability numbers and the customer's answer to 'what happened'.",
      tags: ["outage", "restoration", "timestamped"],
    },
    {
      name: "Meter Service Order",
      description:
        "Install, exchange, read or disconnect a meter: old and new serials, readings, seal numbers, photos of the meter face and a customer signature where one is required.",
      tags: ["meter", "service order", "photos", "signature"],
    },
    {
      name: "Hydrant Flushing & Valve Exercise",
      description:
        "Each hydrant or valve on the programme: flow, pressure, turns, condition and anything that would not open or close. The maintenance record the water quality report depends on.",
      tags: ["water", "maintenance", "readings", "GPS"],
    },
    {
      name: "Line Patrol Log",
      description:
        "Walk or drive a line and record what is seen — vegetation, damaged insulators, leaning structures, encroachment — with a photo and location for each finding.",
      tags: ["patrol", "GPS", "photos", "vegetation"],
    },
  ],

  Energy: [
    {
      name: "Solar Array Inspection",
      description:
        "Panel, string and inverter condition, soiling, shading, connector damage and production readings against expected. One form per array visit.",
      tags: ["solar", "inspection", "readings", "photos"],
    },
    {
      name: "Wind Turbine Service Checklist",
      description:
        "Scheduled maintenance by turbine: torque checks, lubrication, brake and pitch systems, blade condition. Sign-off per section and the lock-out record attached.",
      tags: ["wind", "maintenance", "LOTO", "checklist"],
    },
    {
      name: "Lockout / Tagout Record",
      description:
        "Every energy source isolated, the lock and tag applied, who applied it and when it came off. The document that stands between a technician and a live circuit.",
      tags: ["safety", "LOTO", "signature"],
    },
    {
      name: "Battery Storage Site Inspection",
      description:
        "Enclosure temperature, state of charge, HVAC, fire suppression, alarms and physical condition of a BESS site. Readings per rack, faults photographed.",
      tags: ["storage", "inspection", "readings", "fire"],
    },
    {
      name: "Commissioning Checklist",
      description:
        "Step-by-step verification that a new installation meets the design: tests performed, values recorded, punch-list items and the client's acceptance signature.",
      tags: ["commissioning", "acceptance", "signature", "punch list"],
    },
    {
      name: "Energy Audit Walkthrough",
      description:
        "Building or site survey of lighting, HVAC, envelope and equipment with nameplate photos, run hours and observed waste. The input to a savings proposal.",
      tags: ["audit", "survey", "photos"],
    },
  ],

  Environmental: [
    {
      name: "Chain of Custody",
      description:
        "Each sample from collection to the lab: ID, matrix, time, preservative, and every hand it passes through with a signature. The document that makes a result legally defensible.",
      tags: ["sampling", "lab", "signature", "compliance"],
    },
    {
      name: "Site Assessment Field Log",
      description:
        "Phase I/II site walk: observations, staining, drums, vents, wells, neighbouring uses, photos and sketch. Structured so the report writes itself from it.",
      tags: ["assessment", "photos", "GPS", "Phase I"],
    },
    {
      name: "Groundwater Sampling Log",
      description:
        "Per well: depth to water, purge volume, field parameters until stable, sample time and bottle set. Stabilisation readings recorded in the sequence taken.",
      tags: ["sampling", "readings", "groundwater"],
    },
    {
      name: "Spill Response Report",
      description:
        "Material, estimated volume, containment and clean-up actions, disposal and notifications made, with timestamps and photos. Written for the regulator, filled in during the response.",
      tags: ["incident", "spill", "photos", "timestamped"],
    },
    {
      name: "Stormwater (SWPPP) Inspection",
      description:
        "BMP condition, discharge points, sediment controls and corrective actions after each qualifying rain event. Dates and photos the permit requires.",
      tags: ["stormwater", "inspection", "permit", "photos"],
    },
    {
      name: "Waste Manifest Pickup",
      description:
        "Containers, waste codes, quantities, generator and transporter signatures at pickup. The field half of the manifest, before the paperwork catches up.",
      tags: ["waste", "manifest", "signature"],
    },
  ],

  Facilities: [
    {
      name: "Daily Facility Walkthrough",
      description:
        "One lap of the building on a fixed route: cleanliness, lighting, restrooms, safety hazards, anything broken. Photographed and assigned before the day starts.",
      tags: ["daily", "walkthrough", "photos", "corrective action"],
    },
    {
      name: "Work Order Completion",
      description:
        "What was requested, what was done, parts and time used, before-and-after photos, and the requester's sign-off. Closes the loop on every ticket.",
      tags: ["work order", "photos", "signature", "parts"],
    },
    {
      name: "Preventive Maintenance Checklist",
      description:
        "Scheduled tasks per asset — filters, belts, lubrication, readings — with pass/fail and the next due date. The record that turns reactive maintenance into planned.",
      tags: ["PM", "asset", "schedule", "readings"],
    },
    {
      name: "Fire & Life Safety Inspection",
      description:
        "Extinguishers, exit signs, emergency lighting, alarms, sprinkler gauges and doors, each with a date and a tag number. What the fire marshal asks to see.",
      tags: ["safety", "inspection", "compliance", "monthly"],
    },
    {
      name: "Move / Setup Request",
      description:
        "Room, date, layout, equipment and AV needs, with a sketch or photo of the desired setup. Removes the phone call and the misunderstanding.",
      tags: ["request", "setup", "photos"],
    },
    {
      name: "Vendor Service Verification",
      description:
        "Confirms a contractor's visit: who came, what they serviced, readings or photos of the work, and a staff signature. Evidence for the invoice.",
      tags: ["vendor", "verification", "signature"],
    },
  ],

  HVAC: [
    {
      name: "Service Call Ticket",
      description:
        "Customer, unit, complaint, diagnosis, work performed, parts and refrigerant used, time on site and the customer's signature. What the invoice and the warranty claim come from.",
      tags: ["ticket", "billing", "signature", "parts"],
    },
    {
      name: "Preventive Maintenance Checklist",
      description:
        "Seasonal tune-up by unit: filters, coils, belts, electrical, drain, then supply/return temperatures, pressures and amp draws recorded so decline shows up early.",
      tags: ["PM", "seasonal", "readings", "checklist"],
    },
    {
      name: "Equipment Start-Up Checklist",
      description:
        "Pre-start verification and post-start readings on a new install — voltage, phase, charge by superheat and subcooling, airflow, safeties — against the manufacturer's spec.",
      tags: ["start-up", "install", "readings", "commissioning"],
    },
    {
      name: "Refrigerant Log",
      description:
        "Every add and recovery by unit: type, quantity, cylinder, leak check result and technician certification number. The EPA 608 record, kept as it happens.",
      tags: ["refrigerant", "EPA", "compliance", "readings"],
    },
    {
      name: "Quote / Replacement Proposal",
      description:
        "Nameplate photos, measurements, options and pricing captured on site, with the customer's acceptance signature. Sells the replacement before leaving the driveway.",
      tags: ["quote", "photos", "signature", "sales"],
    },
    {
      name: "Indoor Air Quality Survey",
      description:
        "CO2, humidity, temperature and particulate readings by room, with occupant complaints and observations. The evidence behind a ventilation recommendation.",
      tags: ["IAQ", "readings", "survey"],
    },
  ],

  Roofing: [
    {
      name: "Roof Inspection Report",
      description:
        "Condition by section — membrane or shingles, flashings, penetrations, drains, edges — with photos, measurements and a sketch. The document a claim, a bid or a maintenance plan is built on.",
      tags: ["inspection", "photos", "sketch", "measurements"],
    },
    {
      name: "Daily Job Log",
      description:
        "Crew, hours, squares installed, materials used, weather, tear-off and disposal, photos of progress. One per job per day, the office's view of the roof.",
      tags: ["daily", "photos", "materials", "weather"],
    },
    {
      name: "Roof Work Safety Checklist",
      description:
        "Fall protection in place, anchors, guardrails, warning lines, ladders, skylights covered, weather checked. Signed by the foreman before anyone goes up.",
      tags: ["safety", "fall protection", "signature", "pre-task"],
    },
    {
      name: "Material Order / Delivery Check",
      description:
        "What was ordered against what arrived: quantities, colours, damage, photos of the drop. Catches the short delivery before the crew is standing on the roof waiting.",
      tags: ["materials", "delivery", "photos"],
    },
    {
      name: "Storm Damage Assessment",
      description:
        "Hail and wind evidence by slope — test squares, collateral damage, photos with a scale reference — in the layout adjusters expect.",
      tags: ["insurance", "storm", "photos", "test square"],
    },
    {
      name: "Job Completion & Sign-Off",
      description:
        "Final walk with the customer: photos of the finished roof, clean-up confirmed, warranty registered, and their signature. Closes the job and starts the warranty.",
      tags: ["completion", "signature", "photos", "warranty"],
    },
  ],

  Mining: [
    {
      name: "Pre-Shift Equipment Inspection",
      description:
        "Operator's walk-around of a haul truck, loader or dozer before the shift — brakes, steering, fire suppression, lights, tyres — with defects flagged and the unit tagged out if unsafe.",
      tags: ["equipment", "pre-shift", "MSHA", "tag-out"],
    },
    {
      name: "Workplace Examination",
      description:
        "The MSHA-required examination of each working area before work begins: hazards found, corrective action taken, examiner and time. The record inspectors ask for first.",
      tags: ["MSHA", "examination", "safety", "compliance"],
    },
    {
      name: "Shift Handover Report",
      description:
        "Production, downtime, equipment status, hazards and open items passed from one shift to the next, so nothing is learned twice.",
      tags: ["shift", "handover", "production"],
    },
    {
      name: "Blast Report",
      description:
        "Pattern, holes, explosives by type and quantity, timing, exclusion zone confirmed, post-blast inspection and misfires. The record the regulator and the explosives inventory both need.",
      tags: ["blasting", "compliance", "inventory"],
    },
    {
      name: "Haul Road Inspection",
      description:
        "Grade, width, berms, drainage, surface condition and dust by segment, with photos of anything that needs grading. Roads are where the trucks get hurt.",
      tags: ["inspection", "haul road", "photos", "GPS"],
    },
    {
      name: "Environmental Monitoring Log",
      description:
        "Dust, noise, water discharge and tailings readings at the permit's monitoring points, on the permit's schedule, with exceedances flagged immediately.",
      tags: ["environmental", "readings", "permit"],
    },
  ],

  Pipeline: [
    {
      name: "Right-of-Way Patrol",
      description:
        "Walk, drive or fly the line and record encroachment, exposed pipe, erosion, dead vegetation and third-party activity, geotagged with photos. The DOT-required patrol, kept as it happens.",
      tags: ["patrol", "ROW", "GPS", "photos", "DOT"],
    },
    {
      name: "Cathodic Protection Reading",
      description:
        "Pipe-to-soil potentials at each test station, rectifier output and any reading outside the criterion. Structured so the annual survey compiles itself.",
      tags: ["CP", "readings", "corrosion", "compliance"],
    },
    {
      name: "Valve Inspection & Maintenance",
      description:
        "Operate and inspect each valve on the schedule: turns, leaks, actuator, signage, lock, and whether it fully closed. The record that says the isolation will work when it is needed.",
      tags: ["valve", "maintenance", "readings"],
    },
    {
      name: "Excavation / Dig Report",
      description:
        "Locate ticket, exposure findings, coating condition, wall thickness readings and repair performed, with photos before backfill. The evidence that is gone once the hole is closed.",
      tags: ["dig", "integrity", "photos", "readings"],
    },
    {
      name: "Leak Survey",
      description:
        "Route, instrument, readings and any indication found with its classification and location. Filed per survey, feeding the leak-management record.",
      tags: ["leak", "survey", "readings", "GPS"],
    },
    {
      name: "Pressure Test Record",
      description:
        "Segment, medium, test and hold pressures, duration, temperature correction and chart photo, signed by the test lead. What the regulator asks to see before the line goes into service.",
      tags: ["pressure test", "compliance", "signature"],
    },
  ],

  "Field Service": [
    {
      name: "Work Order / Service Ticket",
      description:
        "The one form every service company runs: customer, asset, problem, work performed, parts, time, photos, and the customer's signature. What the invoice is built from.",
      tags: ["work order", "billing", "signature", "parts"],
    },
    {
      name: "Timesheet",
      description:
        "Hours by job, travel and break, submitted daily from the truck and approved by the supervisor. Ends the Friday reconstruction of the week.",
      tags: ["time", "payroll", "daily", "approval"],
    },
    {
      name: "Vehicle Pre-Trip Inspection",
      description:
        "DVIR-style walk-around each morning — lights, tyres, brakes, fluids, load security — with defects flagged to the fleet manager before the truck leaves.",
      tags: ["vehicle", "DVIR", "daily", "fleet"],
    },
    {
      name: "Site Survey / Estimate",
      description:
        "Measurements, photos, access notes and options captured on the first visit, structured so the estimate can be produced without a second trip.",
      tags: ["survey", "estimate", "photos", "measurements"],
    },
    {
      name: "Installation Checklist",
      description:
        "Every step of an install confirmed in order, with serials, settings, test results and photos of the finished work, and the customer's acceptance at the end.",
      tags: ["install", "checklist", "photos", "signature"],
    },
    {
      name: "Customer Satisfaction Survey",
      description:
        "Three questions and a signature at the end of the visit, while the technician is still there. The feedback loop that catches a problem before the review does.",
      tags: ["survey", "customer", "signature"],
    },
  ],

  Manufacturing: [
    {
      name: "Quality Inspection Record",
      description:
        "Measurements against tolerance for each characteristic on a sample, pass/fail per part, and disposition of anything out of spec. The record an audit traces back to.",
      tags: ["quality", "readings", "tolerance", "audit"],
    },
    {
      name: "Production Line Checklist",
      description:
        "Start-of-shift verification of the line: settings, materials staged, guards in place, first-piece approved. Signed before the line runs.",
      tags: ["production", "shift", "checklist", "signature"],
    },
    {
      name: "Equipment Downtime Report",
      description:
        "Machine, start and end of the stoppage, cause code, action taken and parts used. Every minute of downtime becomes a reason.",
      tags: ["downtime", "maintenance", "cause code"],
    },
    {
      name: "5S / Housekeeping Audit",
      description:
        "Score each area against the five standards with photos of what was found. Trends by area and week show where the discipline is slipping.",
      tags: ["5S", "audit", "photos", "lean"],
    },
    {
      name: "Safety Observation",
      description:
        "A behaviour or condition seen on the floor — safe or unsafe — with location, photo and what was said. Volume of observations is the leading indicator.",
      tags: ["safety", "observation", "photos", "leading indicator"],
    },
    {
      name: "Receiving Inspection",
      description:
        "Incoming material against the PO: quantities, damage, certifications present, sample checks, and accept/reject with photos. Stops a bad lot at the dock.",
      tags: ["receiving", "quality", "photos", "PO"],
    },
  ],

  Logistics: [
    {
      name: "Proof of Delivery",
      description:
        "Items delivered, condition, exceptions, photo of the drop and the receiver's signature with time and location. Ends the 'we never got it' conversation.",
      tags: ["delivery", "signature", "photos", "GPS"],
    },
    {
      name: "Driver Vehicle Inspection Report (DVIR)",
      description:
        "Pre- and post-trip inspection required by the FMCSA: defects found, whether they affect safe operation, and the mechanic's sign-off on the repair.",
      tags: ["DVIR", "FMCSA", "daily", "compliance"],
    },
    {
      name: "Bill of Lading / Pickup",
      description:
        "Shipper, consignee, pieces, weight, hazmat declaration and the shipper's signature at pickup. The field copy, before the paperwork catches up.",
      tags: ["BOL", "pickup", "signature", "hazmat"],
    },
    {
      name: "Damage / Exception Report",
      description:
        "What was damaged, how it was packed, photos from several angles and who was present. Filed at the moment of discovery, when the claim is still winnable.",
      tags: ["damage", "claim", "photos"],
    },
    {
      name: "Yard / Trailer Check",
      description:
        "Every trailer in the yard: number, location, loaded or empty, seal, condition. A daily count that replaces walking the yard with a clipboard.",
      tags: ["yard", "inventory", "trailer"],
    },
    {
      name: "Forklift Pre-Use Inspection",
      description:
        "OSHA-required daily check of each truck — forks, mast, hydraulics, horn, brakes, battery or LP — with the unit removed from service on any failure.",
      tags: ["forklift", "OSHA", "daily", "equipment"],
    },
  ],

  "Property Management": [
    {
      name: "Move-In / Move-Out Inspection",
      description:
        "Condition of every room and fixture with photos, agreed and signed by both parties. The document the deposit decision rests on.",
      tags: ["inspection", "photos", "signature", "deposit"],
    },
    {
      name: "Maintenance Request & Completion",
      description:
        "Tenant's request, technician's diagnosis, work done, parts, before-and-after photos and time, with the tenant's sign-off. Closes the loop on every ticket.",
      tags: ["work order", "photos", "signature", "tenant"],
    },
    {
      name: "Property Inspection Walkthrough",
      description:
        "Periodic exterior and common-area walk: grounds, lighting, parking, roof and gutters, safety hazards, with photos and items assigned. The routine that catches the small things.",
      tags: ["inspection", "walkthrough", "photos", "corrective action"],
    },
    {
      name: "Unit Turn Checklist",
      description:
        "Every task between one tenant and the next — clean, paint, repairs, keys, appliances tested — checked off in order with photos, so the unit is ready when it is promised.",
      tags: ["turn", "checklist", "photos", "make-ready"],
    },
    {
      name: "Vendor Work Verification",
      description:
        "Confirms a contractor's work on site: what was done, photos, and a staff signature before the invoice is approved.",
      tags: ["vendor", "verification", "photos", "signature"],
    },
    {
      name: "Incident Report",
      description:
        "Injury, damage, disturbance or police contact on the property: what, where, who, photos, witnesses and action taken. Filed the same day, for the file and the insurer.",
      tags: ["incident", "photos", "insurance"],
    },
  ],
};

/** Every entry as a flat list, with its industry. */
export function formLibraryRows(): Array<FormLibraryEntry & { industry: string }> {
  return Object.entries(FORM_LIBRARY_SEED).flatMap(([industry, entries]) =>
    entries.map((e) => ({ industry, ...e })),
  );
}
