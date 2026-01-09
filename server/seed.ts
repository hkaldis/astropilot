import { db } from "./db";
import { celestialObjects, telescopes, eyepieces, barlows, filters, cameras, badges } from "@shared/schema";

// Complete Messier Catalog (M1-M110) plus planets and notable non-Messier objects
const sampleObjects = [
  // Planets (all 7 visible planets plus Moon)
  { catalogId: "Mercury", name: "Mercury", category: "planet" as const, constellation: "Various", magnitude: -0.5, size: "10\"", difficulty: "challenging" as const, moonInterference: 0, isHot: false, description: "The smallest and innermost planet, best viewed near greatest elongation at dawn or dusk." },
  { catalogId: "Venus", name: "Venus", category: "planet" as const, constellation: "Various", magnitude: -4.0, size: "25\"", difficulty: "easy" as const, moonInterference: 0, isHot: false, description: "Earth's sister planet showing phases like our Moon." },
  { catalogId: "Mars", name: "Mars", category: "planet" as const, constellation: "Various", magnitude: -0.5, size: "10\"", difficulty: "easy" as const, moonInterference: 0, isHot: false, description: "The red planet with polar ice caps and surface features visible during opposition." },
  { catalogId: "Jupiter", name: "Jupiter", category: "planet" as const, constellation: "Various", magnitude: -2.9, size: "50\"", difficulty: "easy" as const, moonInterference: 0, isHot: true, description: "The largest planet in our solar system with visible cloud bands and four Galilean moons." },
  { catalogId: "Saturn", name: "Saturn", category: "planet" as const, constellation: "Various", magnitude: 0.5, size: "20\"", difficulty: "easy" as const, moonInterference: 0, isHot: true, description: "The ringed planet, spectacular through any telescope." },
  { catalogId: "Uranus", name: "Uranus", category: "planet" as const, constellation: "Various", magnitude: 5.7, size: "4\"", difficulty: "challenging" as const, moonInterference: 0, isHot: false, description: "The ice giant showing a pale blue-green disk. Requires dark skies and at least moderate magnification." },
  { catalogId: "Neptune", name: "Neptune", category: "planet" as const, constellation: "Various", magnitude: 7.8, size: "2\"", difficulty: "challenging" as const, moonInterference: 0, isHot: false, description: "The most distant planet, appearing as a tiny blue disk. Requires a telescope and star chart to locate." },
  
  // Moon
  { catalogId: "Luna", name: "The Moon", category: "moon" as const, constellation: "Various", magnitude: -12.7, size: "31'", difficulty: "easy" as const, moonInterference: 0, isHot: true, description: "Our nearest celestial neighbor with craters, maria, and mountains." },
  
  // === COMPLETE MESSIER CATALOG M1-M110 ===
  // M1
  { catalogId: "M1", name: "Crab Nebula", category: "supernova_remnant" as const, constellation: "Taurus", magnitude: 8.4, size: "7'x5'", rightAscension: "05h 34m", declination: "+22° 01'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["nov", "dec", "jan", "feb"], description: "The remnant of a supernova observed in 1054 AD, contains a pulsar at its center." },
  // M2
  { catalogId: "M2", name: "M2 Globular Cluster", category: "globular_cluster" as const, constellation: "Aquarius", magnitude: 6.3, size: "16'", rightAscension: "21h 33m", declination: "-00° 49'", difficulty: "easy" as const, moonInterference: 2, bestMonths: ["aug", "sep", "oct"], description: "A rich, compact globular cluster with over 150,000 stars." },
  // M3
  { catalogId: "M3", name: "M3 Globular Cluster", category: "globular_cluster" as const, constellation: "Canes Venatici", magnitude: 6.2, size: "18'", rightAscension: "13h 42m", declination: "+28° 23'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["apr", "may", "jun"], description: "One of the brightest and largest globular clusters, containing about 500,000 stars." },
  // M4
  { catalogId: "M4", name: "Cat's Eye Cluster", category: "globular_cluster" as const, constellation: "Scorpius", magnitude: 5.6, size: "36'", rightAscension: "16h 23m", declination: "-26° 32'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["may", "jun", "jul"], description: "The closest globular cluster to Earth at about 7,200 light-years. Contains a central bar of stars." },
  // M5
  { catalogId: "M5", name: "Rose Cluster", category: "globular_cluster" as const, constellation: "Serpens", magnitude: 5.6, size: "23'", rightAscension: "15h 18m", declination: "+02° 05'", difficulty: "easy" as const, moonInterference: 2, isHot: false, bestMonths: ["may", "jun", "jul"], description: "A large, bright globular cluster with over 100,000 stars." },
  // M6
  { catalogId: "M6", name: "Butterfly Cluster", category: "open_cluster" as const, constellation: "Scorpius", magnitude: 4.2, size: "25'", rightAscension: "17h 40m", declination: "-32° 13'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jun", "jul", "aug"], description: "Beautiful open cluster whose stars resemble a butterfly with open wings." },
  // M7
  { catalogId: "M7", name: "Ptolemy Cluster", category: "open_cluster" as const, constellation: "Scorpius", magnitude: 3.3, size: "80'", rightAscension: "17h 53m", declination: "-34° 49'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["jun", "jul", "aug"], description: "A large, bright open cluster known since antiquity. Best viewed with binoculars." },
  // M8
  { catalogId: "M8", name: "Lagoon Nebula", category: "emission_nebula" as const, constellation: "Sagittarius", magnitude: 6.0, size: "90'x40'", rightAscension: "18h 03m", declination: "-24° 23'", difficulty: "easy" as const, moonInterference: 4, isHot: true, bestMonths: ["jun", "jul", "aug"], description: "A large emission nebula and H II region with embedded open cluster NGC 6530." },
  // M9
  { catalogId: "M9", name: "M9 Globular Cluster", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 7.7, size: "12'", rightAscension: "17h 19m", declination: "-18° 31'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "One of the nearer globular clusters to the galactic center." },
  // M10
  { catalogId: "M10", name: "M10 Globular Cluster", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 6.6, size: "20'", rightAscension: "16h 57m", declination: "-04° 06'", difficulty: "easy" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A bright globular cluster with a moderately concentrated core." },
  // M11
  { catalogId: "M11", name: "Wild Duck Cluster", category: "open_cluster" as const, constellation: "Scutum", magnitude: 6.3, size: "14'", rightAscension: "18h 51m", declination: "-06° 16'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["jul", "aug", "sep"], description: "One of the richest and most compact open clusters known, with about 3,000 stars." },
  // M12
  { catalogId: "M12", name: "Gumball Globular", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 6.7, size: "16'", rightAscension: "16h 47m", declination: "-01° 57'", difficulty: "easy" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A loosely concentrated globular cluster, similar in appearance to M10." },
  // M13
  { catalogId: "M13", name: "Great Hercules Cluster", category: "globular_cluster" as const, constellation: "Hercules", magnitude: 5.8, size: "20'", rightAscension: "16h 41m", declination: "+36° 28'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["may", "jun", "jul", "aug"], description: "The finest globular cluster in the northern sky, containing about 300,000 stars." },
  // M14
  { catalogId: "M14", name: "M14 Globular Cluster", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 7.6, size: "11'", rightAscension: "17h 37m", declination: "-03° 15'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A fairly large but loose globular cluster with many variable stars." },
  // M15
  { catalogId: "M15", name: "Great Pegasus Cluster", category: "globular_cluster" as const, constellation: "Pegasus", magnitude: 6.2, size: "18'", rightAscension: "21h 30m", declination: "+12° 10'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["aug", "sep", "oct", "nov"], description: "One of the densest globular clusters, possibly containing a black hole at its core." },
  // M16
  { catalogId: "M16", name: "Eagle Nebula", category: "emission_nebula" as const, constellation: "Serpens", magnitude: 6.0, size: "7'", rightAscension: "18h 18m", declination: "-13° 47'", difficulty: "moderate" as const, moonInterference: 4, isHot: true, bestMonths: ["jun", "jul", "aug"], description: "Famous for the 'Pillars of Creation' photographed by Hubble. Contains star-forming regions." },
  // M17
  { catalogId: "M17", name: "Omega Nebula", category: "emission_nebula" as const, constellation: "Sagittarius", magnitude: 6.0, size: "11'", rightAscension: "18h 20m", declination: "-16° 11'", difficulty: "easy" as const, moonInterference: 4, isHot: true, bestMonths: ["jun", "jul", "aug"], description: "Also known as the Swan or Horseshoe Nebula. One of the brightest emission nebulae." },
  // M18
  { catalogId: "M18", name: "M18 Open Cluster", category: "open_cluster" as const, constellation: "Sagittarius", magnitude: 7.5, size: "9'", rightAscension: "18h 19m", declination: "-17° 08'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jun", "jul", "aug"], description: "A small, sparse open cluster located between M17 and M24." },
  // M19
  { catalogId: "M19", name: "M19 Globular Cluster", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 6.8, size: "17'", rightAscension: "17h 02m", declination: "-26° 16'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "The most oblate (flattened) known globular cluster." },
  // M20
  { catalogId: "M20", name: "Trifid Nebula", category: "mixed_nebula" as const, constellation: "Sagittarius", magnitude: 6.3, size: "28'x28'", rightAscension: "18h 02m", declination: "-23° 02'", difficulty: "moderate" as const, moonInterference: 4, isHot: true, bestMonths: ["jun", "jul", "aug"], description: "An unusual combination of emission, reflection, and dark nebulae divided into three lobes. Filters help emission portion but dim reflection component." },
  // M21
  { catalogId: "M21", name: "M21 Open Cluster", category: "open_cluster" as const, constellation: "Sagittarius", magnitude: 6.5, size: "13'", rightAscension: "18h 04m", declination: "-22° 30'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jun", "jul", "aug"], description: "A young open cluster located just northeast of the Trifid Nebula." },
  // M22
  { catalogId: "M22", name: "Sagittarius Cluster", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 5.1, size: "32'", rightAscension: "18h 36m", declination: "-23° 54'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["jun", "jul", "aug"], description: "One of the brightest globular clusters, visible to naked eye from dark sites." },
  // M23
  { catalogId: "M23", name: "M23 Open Cluster", category: "open_cluster" as const, constellation: "Sagittarius", magnitude: 6.9, size: "27'", rightAscension: "17h 56m", declination: "-19° 01'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jun", "jul", "aug"], description: "A fairly rich open cluster with about 150 stars." },
  // M24
  { catalogId: "M24", name: "Sagittarius Star Cloud", category: "asterism" as const, constellation: "Sagittarius", magnitude: 4.6, size: "90'", rightAscension: "18h 16m", declination: "-18° 29'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jun", "jul", "aug"], description: "A dense star cloud in the Milky Way, not a true cluster but a window through dust." },
  // M25
  { catalogId: "M25", name: "M25 Open Cluster", category: "open_cluster" as const, constellation: "Sagittarius", magnitude: 4.6, size: "40'", rightAscension: "18h 31m", declination: "-19° 15'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jun", "jul", "aug"], description: "A prominent open cluster containing the Cepheid variable U Sagittarii." },
  // M26
  { catalogId: "M26", name: "M26 Open Cluster", category: "open_cluster" as const, constellation: "Scutum", magnitude: 8.0, size: "15'", rightAscension: "18h 45m", declination: "-09° 24'", difficulty: "moderate" as const, moonInterference: 1, bestMonths: ["jul", "aug", "sep"], description: "A small, moderately rich open cluster near the Wild Duck Cluster." },
  // M27
  { catalogId: "M27", name: "Dumbbell Nebula", category: "planetary_nebula" as const, constellation: "Vulpecula", magnitude: 7.4, size: "8'x5.7'", rightAscension: "19h 59m", declination: "+22° 43'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["jul", "aug", "sep", "oct"], description: "The largest and brightest planetary nebula, shaped like an apple core or hourglass." },
  // M28
  { catalogId: "M28", name: "M28 Globular Cluster", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 6.8, size: "11'", rightAscension: "18h 24m", declination: "-24° 52'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A fairly dense globular cluster near the Lagoon Nebula." },
  // M29
  { catalogId: "M29", name: "Cooling Tower Cluster", category: "open_cluster" as const, constellation: "Cygnus", magnitude: 7.1, size: "7'", rightAscension: "20h 23m", declination: "+38° 32'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jul", "aug", "sep", "oct"], description: "A small, sparse open cluster embedded in rich Milky Way star fields." },
  // M30
  { catalogId: "M30", name: "M30 Globular Cluster", category: "globular_cluster" as const, constellation: "Capricornus", magnitude: 7.2, size: "12'", rightAscension: "21h 40m", declination: "-23° 11'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["aug", "sep", "oct"], description: "A dense globular cluster that has undergone core collapse." },
  // M31
  { catalogId: "M31", name: "Andromeda Galaxy", category: "galaxy" as const, constellation: "Andromeda", magnitude: 3.4, size: "178'x63'", rightAscension: "00h 42m", declination: "+41° 16'", difficulty: "easy" as const, moonInterference: 4, isHot: true, bestMonths: ["sep", "oct", "nov", "dec"], description: "The nearest major galaxy to the Milky Way at 2.5 million light-years. Visible to naked eye." },
  // M32
  { catalogId: "M32", name: "Le Gentil", category: "galaxy" as const, constellation: "Andromeda", magnitude: 8.1, size: "9'x7'", rightAscension: "00h 42m", declination: "+40° 52'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["sep", "oct", "nov", "dec"], description: "A compact elliptical satellite galaxy of Andromeda, visible in same field." },
  // M33
  { catalogId: "M33", name: "Triangulum Galaxy", category: "galaxy" as const, constellation: "Triangulum", magnitude: 5.7, size: "73'x45'", rightAscension: "01h 33m", declination: "+30° 39'", difficulty: "challenging" as const, moonInterference: 5, isHot: true, bestMonths: ["sep", "oct", "nov", "dec"], description: "The third-largest member of the Local Group. Face-on spiral with low surface brightness." },
  // M34
  { catalogId: "M34", name: "M34 Open Cluster", category: "open_cluster" as const, constellation: "Perseus", magnitude: 5.5, size: "35'", rightAscension: "02h 42m", declination: "+42° 47'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["oct", "nov", "dec", "jan"], description: "A bright, scattered open cluster with about 100 stars, good for binoculars." },
  // M35
  { catalogId: "M35", name: "Shoe-Buckle Cluster", category: "open_cluster" as const, constellation: "Gemini", magnitude: 5.3, size: "28'", rightAscension: "06h 08m", declination: "+24° 20'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["dec", "jan", "feb", "mar"], description: "A rich open cluster near the feet of Gemini, with about 500 stars." },
  // M36
  { catalogId: "M36", name: "Pinwheel Cluster", category: "open_cluster" as const, constellation: "Auriga", magnitude: 6.3, size: "12'", rightAscension: "05h 36m", declination: "+34° 08'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["dec", "jan", "feb"], description: "One of three bright open clusters in Auriga. Contains about 60 stars." },
  // M37
  { catalogId: "M37", name: "January Salt-and-Pepper Cluster", category: "open_cluster" as const, constellation: "Auriga", magnitude: 6.2, size: "24'", rightAscension: "05h 52m", declination: "+32° 33'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["dec", "jan", "feb"], description: "The richest of the Auriga clusters, with about 500 stars including many red giants." },
  // M38
  { catalogId: "M38", name: "Starfish Cluster", category: "open_cluster" as const, constellation: "Auriga", magnitude: 7.4, size: "21'", rightAscension: "05h 28m", declination: "+35° 50'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["dec", "jan", "feb"], description: "A scattered open cluster with an unusual cross or starfish pattern." },
  // M39
  { catalogId: "M39", name: "M39 Open Cluster", category: "open_cluster" as const, constellation: "Cygnus", magnitude: 5.2, size: "32'", rightAscension: "21h 32m", declination: "+48° 26'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["aug", "sep", "oct"], description: "A large, loose open cluster best viewed with binoculars or low power." },
  // M40
  { catalogId: "M40", name: "Winnecke 4", category: "double_star" as const, constellation: "Ursa Major", magnitude: 8.4, size: "49\"", rightAscension: "12h 22m", declination: "+58° 05'", difficulty: "easy" as const, moonInterference: 0, bestMonths: ["mar", "apr", "may"], description: "A double star, not a deep-sky object. Messier's error but kept in catalog." },
  // M41
  { catalogId: "M41", name: "Little Beehive Cluster", category: "open_cluster" as const, constellation: "Canis Major", magnitude: 4.5, size: "38'", rightAscension: "06h 46m", declination: "-20° 46'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["dec", "jan", "feb"], description: "A bright open cluster about 4 degrees south of Sirius, with about 100 stars." },
  // M42
  { catalogId: "M42", name: "Orion Nebula", category: "emission_nebula" as const, constellation: "Orion", magnitude: 4.0, size: "85'x60'", rightAscension: "05h 35m", declination: "-05° 23'", difficulty: "easy" as const, moonInterference: 3, isHot: true, bestMonths: ["dec", "jan", "feb", "mar"], description: "The Great Orion Nebula, the brightest diffuse nebula and premier winter showpiece." },
  // M43
  { catalogId: "M43", name: "De Mairan's Nebula", category: "emission_nebula" as const, constellation: "Orion", magnitude: 9.0, size: "20'x15'", rightAscension: "05h 35m", declination: "-05° 16'", difficulty: "easy" as const, moonInterference: 3, bestMonths: ["dec", "jan", "feb", "mar"], description: "A separate part of the Orion Nebula complex, connected by a dust lane." },
  // M44
  { catalogId: "M44", name: "Beehive Cluster", category: "open_cluster" as const, constellation: "Cancer", magnitude: 3.7, size: "95'", rightAscension: "08h 40m", declination: "+19° 59'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["feb", "mar", "apr"], description: "Praesepe, a large, bright open cluster visible to naked eye. Known since antiquity." },
  // M45
  { catalogId: "M45", name: "Pleiades", category: "open_cluster" as const, constellation: "Taurus", magnitude: 1.6, size: "110'", rightAscension: "03h 47m", declination: "+24° 07'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["nov", "dec", "jan", "feb"], description: "The Seven Sisters, the most famous star cluster. Surrounded by reflection nebulosity." },
  // M46
  { catalogId: "M46", name: "M46 Open Cluster", category: "open_cluster" as const, constellation: "Puppis", magnitude: 6.1, size: "27'", rightAscension: "07h 41m", declination: "-14° 49'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jan", "feb", "mar"], description: "A rich open cluster with a planetary nebula (NGC 2438) in the foreground." },
  // M47
  { catalogId: "M47", name: "M47 Open Cluster", category: "open_cluster" as const, constellation: "Puppis", magnitude: 4.2, size: "30'", rightAscension: "07h 36m", declination: "-14° 30'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jan", "feb", "mar"], description: "A bright, coarse open cluster visible to naked eye under dark skies." },
  // M48
  { catalogId: "M48", name: "M48 Open Cluster", category: "open_cluster" as const, constellation: "Hydra", magnitude: 5.5, size: "54'", rightAscension: "08h 13m", declination: "-05° 45'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jan", "feb", "mar", "apr"], description: "A scattered open cluster with about 80 stars, good for binoculars." },
  // M49
  { catalogId: "M49", name: "M49 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 8.4, size: "10'x8'", rightAscension: "12h 29m", declination: "+08° 00'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "The first Virgo Cluster galaxy discovered, a giant elliptical galaxy." },
  // M50
  { catalogId: "M50", name: "Heart-Shaped Cluster", category: "open_cluster" as const, constellation: "Monoceros", magnitude: 5.9, size: "16'", rightAscension: "07h 02m", declination: "-08° 20'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jan", "feb", "mar"], description: "A rich open cluster with a heart-like shape when viewed through telescope." },
  // M51
  { catalogId: "M51", name: "Whirlpool Galaxy", category: "galaxy" as const, constellation: "Canes Venatici", magnitude: 8.4, size: "11'x8'", rightAscension: "13h 29m", declination: "+47° 12'", difficulty: "moderate" as const, moonInterference: 4, isHot: true, bestMonths: ["mar", "apr", "may", "jun"], description: "Classic face-on spiral galaxy interacting with NGC 5195. Famous for spiral structure." },
  // M52
  { catalogId: "M52", name: "Scorpion Cluster", category: "open_cluster" as const, constellation: "Cassiopeia", magnitude: 5.0, size: "13'", rightAscension: "23h 24m", declination: "+61° 35'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["sep", "oct", "nov"], description: "A rich, compressed open cluster near the Bubble Nebula." },
  // M53
  { catalogId: "M53", name: "M53 Globular Cluster", category: "globular_cluster" as const, constellation: "Coma Berenices", magnitude: 7.6, size: "13'", rightAscension: "13h 12m", declination: "+18° 10'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["apr", "may", "jun"], description: "One of the more outlying globular clusters at 58,000 light-years from galactic center." },
  // M54
  { catalogId: "M54", name: "M54 Globular Cluster", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 7.6, size: "12'", rightAscension: "18h 55m", declination: "-30° 29'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "Actually a globular cluster belonging to the Sagittarius Dwarf Elliptical Galaxy." },
  // M55
  { catalogId: "M55", name: "Summer Rose Star", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 6.3, size: "19'", rightAscension: "19h 40m", declination: "-30° 58'", difficulty: "easy" as const, moonInterference: 2, bestMonths: ["jul", "aug", "sep"], description: "A large, loose globular cluster with an unusually low concentration." },
  // M56
  { catalogId: "M56", name: "M56 Globular Cluster", category: "globular_cluster" as const, constellation: "Lyra", magnitude: 8.3, size: "9'", rightAscension: "19h 16m", declination: "+30° 11'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jul", "aug", "sep"], description: "A moderately concentrated globular cluster between Beta Cygni and Gamma Lyrae." },
  // M57
  { catalogId: "M57", name: "Ring Nebula", category: "planetary_nebula" as const, constellation: "Lyra", magnitude: 8.8, size: "2.5'x2'", rightAscension: "18h 53m", declination: "+33° 02'", difficulty: "moderate" as const, moonInterference: 2, isHot: true, bestMonths: ["jun", "jul", "aug", "sep"], description: "The classic ring-shaped planetary nebula. One of the most observed nebulae." },
  // M58
  { catalogId: "M58", name: "M58 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 9.7, size: "6'x5'", rightAscension: "12h 37m", declination: "+11° 49'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A barred spiral galaxy in the Virgo Cluster." },
  // M59
  { catalogId: "M59", name: "M59 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 9.6, size: "5'x4'", rightAscension: "12h 42m", declination: "+11° 39'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "An elliptical galaxy in the Virgo Cluster with a rapidly rotating disk." },
  // M60
  { catalogId: "M60", name: "M60 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 8.8, size: "7'x6'", rightAscension: "12h 43m", declination: "+11° 33'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A giant elliptical galaxy in the Virgo Cluster with a central black hole." },
  // M61
  { catalogId: "M61", name: "M61 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 9.7, size: "6'x5'", rightAscension: "12h 21m", declination: "+04° 28'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A beautiful face-on barred spiral galaxy, one of the largest in the Virgo Cluster." },
  // M62
  { catalogId: "M62", name: "M62 Globular Cluster", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 6.5, size: "15'", rightAscension: "17h 01m", declination: "-30° 07'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A dense globular cluster close to the galactic center, noticeably asymmetrical." },
  // M63
  { catalogId: "M63", name: "Sunflower Galaxy", category: "galaxy" as const, constellation: "Canes Venatici", magnitude: 8.6, size: "13'x8'", rightAscension: "13h 15m", declination: "+42° 02'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["mar", "apr", "may", "jun"], description: "A flocculent spiral galaxy with patchy, fragmented spiral arms." },
  // M64
  { catalogId: "M64", name: "Black Eye Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 8.5, size: "10'x5'", rightAscension: "12h 56m", declination: "+21° 41'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["mar", "apr", "may", "jun"], description: "Famous for its prominent dark dust band giving it the 'black eye' appearance." },
  // M65
  { catalogId: "M65", name: "Leo Triplet Galaxy", category: "galaxy" as const, constellation: "Leo", magnitude: 9.3, size: "10'x3'", rightAscension: "11h 18m", declination: "+13° 05'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may"], description: "Part of the Leo Triplet, a tilted spiral galaxy with a prominent dust lane." },
  // M66
  { catalogId: "M66", name: "Leo Triplet Galaxy", category: "galaxy" as const, constellation: "Leo", magnitude: 8.9, size: "9'x4'", rightAscension: "11h 20m", declination: "+12° 59'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["mar", "apr", "may"], description: "The brightest of the Leo Triplet, with asymmetric spiral arms from gravitational interaction." },
  // M67
  { catalogId: "M67", name: "King Cobra Cluster", category: "open_cluster" as const, constellation: "Cancer", magnitude: 6.1, size: "30'", rightAscension: "08h 50m", declination: "+11° 49'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["feb", "mar", "apr"], description: "One of the oldest known open clusters at about 4 billion years old." },
  // M68
  { catalogId: "M68", name: "M68 Globular Cluster", category: "globular_cluster" as const, constellation: "Hydra", magnitude: 7.8, size: "11'", rightAscension: "12h 39m", declination: "-26° 45'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["mar", "apr", "may"], description: "A moderately concentrated globular cluster in the southern sky." },
  // M69
  { catalogId: "M69", name: "M69 Globular Cluster", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 7.6, size: "10'", rightAscension: "18h 31m", declination: "-32° 21'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A fairly rich globular cluster close to the galactic center." },
  // M70
  { catalogId: "M70", name: "M70 Globular Cluster", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 7.9, size: "8'", rightAscension: "18h 43m", declination: "-32° 18'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jun", "jul", "aug"], description: "A dense globular cluster that has undergone core collapse." },
  // M71
  { catalogId: "M71", name: "M71 Globular Cluster", category: "globular_cluster" as const, constellation: "Sagitta", magnitude: 8.2, size: "7'", rightAscension: "19h 53m", declination: "+18° 47'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jul", "aug", "sep"], description: "A very loose globular cluster, once thought to be an open cluster." },
  // M72
  { catalogId: "M72", name: "M72 Globular Cluster", category: "globular_cluster" as const, constellation: "Aquarius", magnitude: 9.3, size: "6'", rightAscension: "20h 53m", declination: "-12° 32'", difficulty: "challenging" as const, moonInterference: 2, bestMonths: ["aug", "sep", "oct"], description: "One of the remotest Messier globulars at 55,000 light-years." },
  // M73
  { catalogId: "M73", name: "M73 Asterism", category: "asterism" as const, constellation: "Aquarius", magnitude: 9.0, size: "3'", rightAscension: "20h 58m", declination: "-12° 38'", difficulty: "moderate" as const, moonInterference: 1, bestMonths: ["aug", "sep", "oct"], description: "A Y-shaped asterism of four stars, not a true cluster." },
  // M74
  { catalogId: "M74", name: "Phantom Galaxy", category: "galaxy" as const, constellation: "Pisces", magnitude: 9.4, size: "10'x9'", rightAscension: "01h 36m", declination: "+15° 47'", difficulty: "challenging" as const, moonInterference: 4, isHot: true, bestMonths: ["oct", "nov", "dec"], description: "A grand design face-on spiral galaxy with very low surface brightness." },
  // M75
  { catalogId: "M75", name: "M75 Globular Cluster", category: "globular_cluster" as const, constellation: "Sagittarius", magnitude: 8.5, size: "6'", rightAscension: "20h 06m", declination: "-21° 55'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jul", "aug", "sep"], description: "A highly concentrated globular cluster at 68,000 light-years distance." },
  // M76
  { catalogId: "M76", name: "Little Dumbbell Nebula", category: "planetary_nebula" as const, constellation: "Perseus", magnitude: 10.1, size: "2.7'x1.8'", rightAscension: "01h 42m", declination: "+51° 34'", difficulty: "challenging" as const, moonInterference: 2, bestMonths: ["oct", "nov", "dec", "jan"], description: "One of the faintest Messier objects, resembles a smaller version of M27." },
  // M77
  { catalogId: "M77", name: "Cetus A Galaxy", category: "galaxy" as const, constellation: "Cetus", magnitude: 8.9, size: "7'x6'", rightAscension: "02h 42m", declination: "-00° 01'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["oct", "nov", "dec"], description: "A Seyfert galaxy with an active galactic nucleus, the largest in the Messier catalog." },
  // M78
  { catalogId: "M78", name: "M78 Reflection Nebula", category: "reflection_nebula" as const, constellation: "Orion", magnitude: 8.3, size: "8'x6'", rightAscension: "05h 46m", declination: "+00° 03'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["dec", "jan", "feb", "mar"], description: "The brightest diffuse reflection nebula in the sky. Reflects starlight - do NOT use narrowband filters." },
  // M79
  { catalogId: "M79", name: "M79 Globular Cluster", category: "globular_cluster" as const, constellation: "Lepus", magnitude: 7.7, size: "10'", rightAscension: "05h 24m", declination: "-24° 33'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["dec", "jan", "feb"], description: "An unusual globular cluster on the opposite side of the sky from the galactic center." },
  // M80
  { catalogId: "M80", name: "M80 Globular Cluster", category: "globular_cluster" as const, constellation: "Scorpius", magnitude: 7.3, size: "10'", rightAscension: "16h 17m", declination: "-22° 59'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["may", "jun", "jul"], description: "One of the densest globular clusters known, with a very bright core." },
  // M81
  { catalogId: "M81", name: "Bode's Galaxy", category: "galaxy" as const, constellation: "Ursa Major", magnitude: 6.9, size: "27'x14'", rightAscension: "09h 55m", declination: "+69° 04'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["feb", "mar", "apr", "may"], description: "A grand design spiral galaxy, one of the brightest in the night sky." },
  // M82
  { catalogId: "M82", name: "Cigar Galaxy", category: "galaxy" as const, constellation: "Ursa Major", magnitude: 8.4, size: "11'x4'", rightAscension: "09h 55m", declination: "+69° 41'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["feb", "mar", "apr", "may"], description: "Starburst galaxy with prominent dust lanes and outflows, companion to M81." },
  // M83
  { catalogId: "M83", name: "Southern Pinwheel Galaxy", category: "galaxy" as const, constellation: "Hydra", magnitude: 7.5, size: "13'x12'", rightAscension: "13h 37m", declination: "-29° 52'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["apr", "may", "jun"], description: "A barred spiral galaxy known for its active star formation and many supernovae." },
  // M84
  { catalogId: "M84", name: "M84 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 9.1, size: "7'x6'", rightAscension: "12h 25m", declination: "+12° 53'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A lenticular or elliptical galaxy in the core of the Virgo Cluster." },
  // M85
  { catalogId: "M85", name: "M85 Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 9.1, size: "7'x5'", rightAscension: "12h 25m", declination: "+18° 11'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A lenticular galaxy, the northernmost member of the Virgo Cluster." },
  // M86
  { catalogId: "M86", name: "M86 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 8.9, size: "9'x6'", rightAscension: "12h 26m", declination: "+12° 57'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "An elliptical or lenticular galaxy in the heart of the Virgo Cluster." },
  // M87
  { catalogId: "M87", name: "Virgo A Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 8.6, size: "8'x7'", rightAscension: "12h 30m", declination: "+12° 24'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["mar", "apr", "may", "jun"], description: "A giant elliptical galaxy with a famous jet and supermassive black hole (first black hole imaged)." },
  // M88
  { catalogId: "M88", name: "M88 Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 9.6, size: "7'x4'", rightAscension: "12h 32m", declination: "+14° 25'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A nearly edge-on spiral galaxy in the Virgo Cluster." },
  // M89
  { catalogId: "M89", name: "M89 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 9.8, size: "5'x5'", rightAscension: "12h 35m", declination: "+12° 33'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "An almost perfectly circular elliptical galaxy in the Virgo Cluster." },
  // M90
  { catalogId: "M90", name: "M90 Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 9.5, size: "10'x5'", rightAscension: "12h 36m", declination: "+13° 10'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A spiral galaxy approaching us, showing a rare blueshift." },
  // M91
  { catalogId: "M91", name: "M91 Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 10.2, size: "6'x5'", rightAscension: "12h 35m", declination: "+14° 30'", difficulty: "challenging" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A barred spiral galaxy with very low surface brightness." },
  // M92
  { catalogId: "M92", name: "M92 Globular Cluster", category: "globular_cluster" as const, constellation: "Hercules", magnitude: 6.4, size: "14'", rightAscension: "17h 17m", declination: "+43° 08'", difficulty: "easy" as const, moonInterference: 2, isHot: true, bestMonths: ["may", "jun", "jul", "aug"], description: "A bright globular cluster often overlooked in favor of nearby M13." },
  // M93
  { catalogId: "M93", name: "M93 Open Cluster", category: "open_cluster" as const, constellation: "Puppis", magnitude: 6.0, size: "22'", rightAscension: "07h 44m", declination: "-23° 52'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["jan", "feb", "mar"], description: "A bright open cluster with about 80 stars in a wedge-shaped pattern." },
  // M94
  { catalogId: "M94", name: "Cat's Eye Galaxy", category: "galaxy" as const, constellation: "Canes Venatici", magnitude: 8.2, size: "14'x12'", rightAscension: "12h 50m", declination: "+41° 07'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A spiral galaxy with a bright central starburst ring." },
  // M95
  { catalogId: "M95", name: "M95 Galaxy", category: "galaxy" as const, constellation: "Leo", magnitude: 9.7, size: "7'x5'", rightAscension: "10h 43m", declination: "+11° 42'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may"], description: "A barred spiral galaxy forming a group with M96 and M105." },
  // M96
  { catalogId: "M96", name: "M96 Galaxy", category: "galaxy" as const, constellation: "Leo", magnitude: 9.2, size: "8'x6'", rightAscension: "10h 46m", declination: "+11° 49'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may"], description: "A spiral galaxy and the brightest member of the Leo I Group." },
  // M97
  { catalogId: "M97", name: "Owl Nebula", category: "planetary_nebula" as const, constellation: "Ursa Major", magnitude: 9.9, size: "3.4'x3.3'", rightAscension: "11h 14m", declination: "+55° 01'", difficulty: "challenging" as const, moonInterference: 2, isHot: true, bestMonths: ["mar", "apr", "may"], description: "A planetary nebula with two dark spots resembling an owl's eyes." },
  // M98
  { catalogId: "M98", name: "M98 Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 10.1, size: "10'x3'", rightAscension: "12h 13m", declination: "+14° 54'", difficulty: "challenging" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A nearly edge-on spiral galaxy approaching us (blueshifted)." },
  // M99
  { catalogId: "M99", name: "Coma Pinwheel Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 9.9, size: "5'x5'", rightAscension: "12h 18m", declination: "+14° 25'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "An asymmetric spiral galaxy with one arm stretched from gravitational interaction." },
  // M100
  { catalogId: "M100", name: "Mirror Galaxy", category: "galaxy" as const, constellation: "Coma Berenices", magnitude: 9.3, size: "7'x6'", rightAscension: "12h 22m", declination: "+15° 49'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may", "jun"], description: "A grand design face-on spiral galaxy in the Virgo Cluster." },
  // M101
  { catalogId: "M101", name: "Pinwheel Galaxy", category: "galaxy" as const, constellation: "Ursa Major", magnitude: 7.9, size: "29'x27'", rightAscension: "14h 03m", declination: "+54° 21'", difficulty: "moderate" as const, moonInterference: 4, isHot: true, bestMonths: ["mar", "apr", "may", "jun"], description: "A grand design face-on spiral galaxy nearly twice the diameter of the Milky Way." },
  // M102 - Disputed, commonly identified as NGC 5866 or duplicate of M101
  { catalogId: "M102", name: "Spindle Galaxy", category: "galaxy" as const, constellation: "Draco", magnitude: 9.9, size: "5'x2'", rightAscension: "15h 06m", declination: "+55° 46'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["apr", "may", "jun", "jul"], description: "An edge-on lenticular galaxy with a prominent dust lane (NGC 5866)." },
  // M103
  { catalogId: "M103", name: "M103 Open Cluster", category: "open_cluster" as const, constellation: "Cassiopeia", magnitude: 7.4, size: "6'", rightAscension: "01h 33m", declination: "+60° 42'", difficulty: "easy" as const, moonInterference: 1, bestMonths: ["oct", "nov", "dec", "jan"], description: "A small but pretty open cluster with a fan-shaped pattern of stars." },
  // M104
  { catalogId: "M104", name: "Sombrero Galaxy", category: "galaxy" as const, constellation: "Virgo", magnitude: 8.0, size: "9'x4'", rightAscension: "12h 39m", declination: "-11° 37'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["apr", "may", "jun"], description: "Iconic edge-on galaxy with a prominent dust lane and large central bulge." },
  // M105
  { catalogId: "M105", name: "M105 Galaxy", category: "galaxy" as const, constellation: "Leo", magnitude: 9.3, size: "5'x5'", rightAscension: "10h 47m", declination: "+12° 35'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may"], description: "An elliptical galaxy in the Leo I Group with a supermassive black hole." },
  // M106
  { catalogId: "M106", name: "M106 Galaxy", category: "galaxy" as const, constellation: "Canes Venatici", magnitude: 8.4, size: "19'x8'", rightAscension: "12h 18m", declination: "+47° 18'", difficulty: "moderate" as const, moonInterference: 3, isHot: true, bestMonths: ["mar", "apr", "may", "jun"], description: "A Seyfert galaxy with anomalous spiral arms caused by active galactic nucleus." },
  // M107
  { catalogId: "M107", name: "M107 Globular Cluster", category: "globular_cluster" as const, constellation: "Ophiuchus", magnitude: 7.9, size: "13'", rightAscension: "16h 32m", declination: "-13° 03'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["may", "jun", "jul", "aug"], description: "A loose globular cluster with a relatively sparse center." },
  // M108
  { catalogId: "M108", name: "Surfboard Galaxy", category: "galaxy" as const, constellation: "Ursa Major", magnitude: 10.0, size: "8'x2'", rightAscension: "11h 11m", declination: "+55° 40'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may"], description: "An edge-on barred spiral galaxy near the Owl Nebula." },
  // M109
  { catalogId: "M109", name: "Vacuum Cleaner Galaxy", category: "galaxy" as const, constellation: "Ursa Major", magnitude: 9.8, size: "8'x5'", rightAscension: "11h 57m", declination: "+53° 23'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["mar", "apr", "may"], description: "A barred spiral galaxy with a bright central bar." },
  // M110
  { catalogId: "M110", name: "M110 Galaxy", category: "galaxy" as const, constellation: "Andromeda", magnitude: 8.5, size: "21'x10'", rightAscension: "00h 40m", declination: "+41° 41'", difficulty: "moderate" as const, moonInterference: 3, bestMonths: ["sep", "oct", "nov", "dec"], description: "An elliptical satellite galaxy of Andromeda, the last object added to the Messier catalog." },

  // === NOTABLE NON-MESSIER OBJECTS ===
  // Double Stars
  { catalogId: "Albireo", name: "Albireo", category: "double_star" as const, constellation: "Cygnus", magnitude: 3.1, size: "34\"", rightAscension: "19h 30m", declination: "+27° 58'", difficulty: "easy" as const, moonInterference: 0, isHot: true, description: "Stunning gold and blue double star at the head of Cygnus." },
  { catalogId: "Mizar", name: "Mizar and Alcor", category: "double_star" as const, constellation: "Ursa Major", magnitude: 2.3, size: "11'", rightAscension: "13h 23m", declination: "+54° 55'", difficulty: "easy" as const, moonInterference: 0, isHot: false, description: "Famous double star in the handle of the Big Dipper, actually a sextuple system." },
  
  // Notable NGC Objects
  { catalogId: "NGC869", name: "Double Cluster (h)", category: "open_cluster" as const, constellation: "Perseus", magnitude: 4.3, size: "30'", rightAscension: "02h 19m", declination: "+57° 09'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["oct", "nov", "dec", "jan"], description: "Half of the spectacular Double Cluster in Perseus." },
  { catalogId: "NGC884", name: "Double Cluster (Chi)", category: "open_cluster" as const, constellation: "Perseus", magnitude: 4.4, size: "30'", rightAscension: "02h 22m", declination: "+57° 07'", difficulty: "easy" as const, moonInterference: 1, isHot: true, bestMonths: ["oct", "nov", "dec", "jan"], description: "The other half of the Double Cluster, visible in the same field of view." },
  { catalogId: "NGC7000", name: "North America Nebula", category: "emission_nebula" as const, constellation: "Cygnus", magnitude: 4.0, size: "120'x100'", rightAscension: "20h 59m", declination: "+44° 32'", difficulty: "challenging" as const, moonInterference: 5, isHot: true, bestMonths: ["aug", "sep", "oct"], description: "Large emission nebula shaped like North America, best with UHC filter." },
  { catalogId: "NGC6826", name: "Blinking Planetary", category: "planetary_nebula" as const, constellation: "Cygnus", magnitude: 8.8, size: "27\"", rightAscension: "19h 44m", declination: "+50° 31'", difficulty: "moderate" as const, moonInterference: 2, bestMonths: ["jul", "aug", "sep"], description: "Small planetary nebula that appears to blink when viewed directly vs. averted vision." },
  { catalogId: "NGC6960", name: "Veil Nebula (Western)", category: "supernova_remnant" as const, constellation: "Cygnus", magnitude: 7.0, size: "70'", rightAscension: "20h 45m", declination: "+30° 43'", difficulty: "challenging" as const, moonInterference: 5, isHot: true, bestMonths: ["aug", "sep", "oct"], description: "Western portion of the Cygnus Loop supernova remnant, best with UHC or OIII filter." },
  { catalogId: "NGC6992", name: "Veil Nebula (Eastern)", category: "supernova_remnant" as const, constellation: "Cygnus", magnitude: 7.0, size: "60'", rightAscension: "20h 56m", declination: "+31° 43'", difficulty: "challenging" as const, moonInterference: 5, bestMonths: ["aug", "sep", "oct"], description: "Eastern portion of the Cygnus Loop, shows beautiful filamentary structure with filters." },
  { catalogId: "IC434", name: "Horsehead Nebula", category: "dark_nebula" as const, constellation: "Orion", magnitude: 6.8, size: "8'x6'", rightAscension: "05h 40m", declination: "-02° 28'", difficulty: "expert" as const, moonInterference: 5, isHot: true, bestMonths: ["dec", "jan", "feb", "mar"], description: "Iconic dark nebula shaped like a horse's head, requires dark skies and H-beta filter. OIII does not help - use H-beta filter." },
  { catalogId: "IC443", name: "Jellyfish Nebula", category: "supernova_remnant" as const, constellation: "Gemini", magnitude: 12.0, size: "50'", rightAscension: "06h 17m", declination: "+22° 47'", difficulty: "expert" as const, moonInterference: 5, bestMonths: ["dec", "jan", "feb", "mar"], description: "Large, faint supernova remnant requiring dark skies and nebula filters." },
];

// Popular telescopes - real models with realistic specs
const popularTelescopes = [
  // Refractors
  { name: "Celestron 80mm AZ Refractor", aperture: 80, focalLength: 900, type: "Refractor" },
  { name: "Orion 90mm ED Refractor", aperture: 90, focalLength: 900, type: "Refractor" },
  { name: "Sky-Watcher ProED 120mm", aperture: 120, focalLength: 840, type: "Refractor" },
  { name: "Takahashi FSQ-85", aperture: 85, focalLength: 450, type: "Refractor" },
  
  // Reflectors
  { name: "Celestron 130 SLT", aperture: 130, focalLength: 650, type: "Reflector" },
  { name: "Orion 8\" Dob", aperture: 203, focalLength: 1200, type: "Reflector" },
  { name: "Sky-Watcher 10\" Dobsonian", aperture: 254, focalLength: 1200, type: "Reflector" },
  { name: "Meade 16\" LightBridge", aperture: 406, focalLength: 1829, type: "Reflector" },
  
  // Catadioptric
  { name: "Celestron 8\" SchmidtCassegrain", aperture: 203, focalLength: 2032, type: "Catadioptric" },
  { name: "Meade 10\" LX90", aperture: 254, focalLength: 2540, type: "Catadioptric" },
  { name: "Orion 6\" Ritchey-Chrétien", aperture: 150, focalLength: 1350, type: "Catadioptric" },
  { name: "Celestron 11\" EdgeHD", aperture: 279, focalLength: 2800, type: "Catadioptric" },
];

// Popular eyepieces - real models with realistic specs
const popularEyepieces = [
  // === EXPLORE SCIENTIFIC 82° SERIES (Ultra-wide, waterproof) ===
  { name: "Explore Scientific 82° 30mm", focalLength: 30, apparentFov: 82 },
  { name: "Explore Scientific 82° 24mm", focalLength: 24, apparentFov: 82 },
  { name: "Explore Scientific 82° 18mm", focalLength: 18, apparentFov: 82 },
  { name: "Explore Scientific 82° 14mm", focalLength: 14, apparentFov: 82 },
  { name: "Explore Scientific 82° 11mm", focalLength: 11, apparentFov: 82 },
  { name: "Explore Scientific 82° 8.8mm", focalLength: 8.8, apparentFov: 82 },
  { name: "Explore Scientific 82° 6.7mm", focalLength: 6.7, apparentFov: 82 },
  { name: "Explore Scientific 82° 4.7mm", focalLength: 4.7, apparentFov: 82 },
  // ES 82° Long Eye Relief versions
  { name: "Explore Scientific 82° 8.5mm LER", focalLength: 8.5, apparentFov: 82 },
  { name: "Explore Scientific 82° 6.5mm LER", focalLength: 6.5, apparentFov: 82 },
  { name: "Explore Scientific 82° 4.5mm LER", focalLength: 4.5, apparentFov: 82 },
  
  // === EXPLORE SCIENTIFIC 100° SERIES (Premium ultra-wide) ===
  { name: "Explore Scientific 100° 25mm", focalLength: 25, apparentFov: 100 },
  { name: "Explore Scientific 100° 20mm", focalLength: 20, apparentFov: 100 },
  { name: "Explore Scientific 100° 14mm", focalLength: 14, apparentFov: 100 },
  { name: "Explore Scientific 100° 9mm", focalLength: 9, apparentFov: 100 },
  { name: "Explore Scientific 100° 5.5mm", focalLength: 5.5, apparentFov: 100 },
  
  // === EXPLORE SCIENTIFIC 68° SERIES (Traditional wide-field) ===
  { name: "Explore Scientific 68° 24mm", focalLength: 24, apparentFov: 68 },
  { name: "Explore Scientific 68° 20mm", focalLength: 20, apparentFov: 68 },
  { name: "Explore Scientific 68° 16mm", focalLength: 16, apparentFov: 68 },
  { name: "Explore Scientific 68° 12mm", focalLength: 12, apparentFov: 68 },
  
  // === EXPLORE SCIENTIFIC 62° SERIES (Value) ===
  { name: "Explore Scientific 62° 32mm", focalLength: 32, apparentFov: 62 },
  { name: "Explore Scientific 62° 26mm", focalLength: 26, apparentFov: 62 },
  { name: "Explore Scientific 62° 20mm", focalLength: 20, apparentFov: 62 },
  { name: "Explore Scientific 62° 14mm", focalLength: 14, apparentFov: 62 },
  { name: "Explore Scientific 62° 9mm", focalLength: 9, apparentFov: 62 },
  { name: "Explore Scientific 62° 5.5mm", focalLength: 5.5, apparentFov: 62 },
  
  // === TELEVUE ETHOS (100° Spacewalk) ===
  { name: "Televue Ethos 21mm", focalLength: 21, apparentFov: 100 },
  { name: "Televue Ethos 17mm", focalLength: 17, apparentFov: 100 },
  { name: "Televue Ethos 13mm", focalLength: 13, apparentFov: 100 },
  { name: "Televue Ethos 10mm", focalLength: 10, apparentFov: 100 },
  { name: "Televue Ethos 8mm", focalLength: 8, apparentFov: 100 },
  { name: "Televue Ethos 6mm", focalLength: 6, apparentFov: 100 },
  { name: "Televue Ethos SX 4.7mm", focalLength: 4.7, apparentFov: 110 },
  { name: "Televue Ethos SX 3.7mm", focalLength: 3.7, apparentFov: 110 },
  
  // === TELEVUE NAGLER (82° Legend) ===
  { name: "Televue Nagler Type 5 31mm", focalLength: 31, apparentFov: 82 },
  { name: "Televue Nagler Type 5 26mm", focalLength: 26, apparentFov: 82 },
  { name: "Televue Nagler Type 5 20mm", focalLength: 20, apparentFov: 82 },
  { name: "Televue Nagler Type 5 16mm", focalLength: 16, apparentFov: 82 },
  { name: "Televue Nagler Type 4 22mm", focalLength: 22, apparentFov: 82 },
  { name: "Televue Nagler Type 4 17mm", focalLength: 17, apparentFov: 82 },
  { name: "Televue Nagler Type 4 12mm", focalLength: 12, apparentFov: 82 },
  { name: "Televue Nagler Type 6 13mm", focalLength: 13, apparentFov: 82 },
  { name: "Televue Nagler Type 6 9mm", focalLength: 9, apparentFov: 82 },
  { name: "Televue Nagler Type 6 7mm", focalLength: 7, apparentFov: 82 },
  { name: "Televue Nagler Type 6 5mm", focalLength: 5, apparentFov: 82 },
  { name: "Televue Nagler Type 6 3.5mm", focalLength: 3.5, apparentFov: 82 },
  { name: "Televue Nagler Type 6 2.5mm", focalLength: 2.5, apparentFov: 82 },
  { name: "Televue Nagler Zoom 3-6mm", focalLength: 4.5, apparentFov: 50 },
  
  // === TELEVUE DELOS (72° Long Eye Relief) ===
  { name: "Televue Delos 17.3mm", focalLength: 17.3, apparentFov: 72 },
  { name: "Televue Delos 14mm", focalLength: 14, apparentFov: 72 },
  { name: "Televue Delos 12mm", focalLength: 12, apparentFov: 72 },
  { name: "Televue Delos 10mm", focalLength: 10, apparentFov: 72 },
  { name: "Televue Delos 8mm", focalLength: 8, apparentFov: 72 },
  { name: "Televue Delos 6mm", focalLength: 6, apparentFov: 72 },
  { name: "Televue Delos 4.5mm", focalLength: 4.5, apparentFov: 72 },
  { name: "Televue Delos 3.5mm", focalLength: 3.5, apparentFov: 72 },
  
  // === TELEVUE DELITE (62° Lightweight) ===
  { name: "Televue DeLite 18.2mm", focalLength: 18.2, apparentFov: 62 },
  { name: "Televue DeLite 11mm", focalLength: 11, apparentFov: 62 },
  { name: "Televue DeLite 7mm", focalLength: 7, apparentFov: 62 },
  { name: "Televue DeLite 5mm", focalLength: 5, apparentFov: 62 },
  
  // === TELEVUE PANOPTIC (68° Wide Field) ===
  { name: "Televue Panoptic 41mm", focalLength: 41, apparentFov: 68 },
  { name: "Televue Panoptic 35mm", focalLength: 35, apparentFov: 68 },
  { name: "Televue Panoptic 27mm", focalLength: 27, apparentFov: 68 },
  { name: "Televue Panoptic 24mm", focalLength: 24, apparentFov: 68 },
  { name: "Televue Panoptic 19mm", focalLength: 19, apparentFov: 68 },
  
  // === TELEVUE PLOSSL (50° Classic) ===
  { name: "Televue Plossl 55mm", focalLength: 55, apparentFov: 50 },
  { name: "Televue Plossl 40mm", focalLength: 40, apparentFov: 50 },
  { name: "Televue Plossl 32mm", focalLength: 32, apparentFov: 50 },
  { name: "Televue Plossl 25mm", focalLength: 25, apparentFov: 50 },
  { name: "Televue Plossl 20mm", focalLength: 20, apparentFov: 50 },
  { name: "Televue Plossl 15mm", focalLength: 15, apparentFov: 50 },
  { name: "Televue Plossl 11mm", focalLength: 11, apparentFov: 50 },
  { name: "Televue Plossl 8mm", focalLength: 8, apparentFov: 50 },
  
  // === BAADER HYPERION (68° Modular) ===
  { name: "Baader Hyperion 36mm", focalLength: 36, apparentFov: 68 },
  { name: "Baader Hyperion 24mm", focalLength: 24, apparentFov: 68 },
  { name: "Baader Hyperion 21mm", focalLength: 21, apparentFov: 68 },
  { name: "Baader Hyperion 17mm", focalLength: 17, apparentFov: 68 },
  { name: "Baader Hyperion 13mm", focalLength: 13, apparentFov: 68 },
  { name: "Baader Hyperion 10mm", focalLength: 10, apparentFov: 68 },
  { name: "Baader Hyperion 8mm", focalLength: 8, apparentFov: 68 },
  { name: "Baader Hyperion 5mm", focalLength: 5, apparentFov: 68 },
  
  // === BAADER MORPHEUS (76° Premium) ===
  { name: "Baader Morpheus 17.5mm", focalLength: 17.5, apparentFov: 76 },
  { name: "Baader Morpheus 14mm", focalLength: 14, apparentFov: 76 },
  { name: "Baader Morpheus 12.5mm", focalLength: 12.5, apparentFov: 76 },
  { name: "Baader Morpheus 9mm", focalLength: 9, apparentFov: 76 },
  { name: "Baader Morpheus 6.5mm", focalLength: 6.5, apparentFov: 76 },
  { name: "Baader Morpheus 4.5mm", focalLength: 4.5, apparentFov: 76 },
  
  // === BAADER CLASSIC ORTHO (Planetary) ===
  { name: "Baader Classic Ortho 18mm", focalLength: 18, apparentFov: 50 },
  { name: "Baader Classic Ortho 10mm", focalLength: 10, apparentFov: 50 },
  { name: "Baader Classic Ortho 6mm", focalLength: 6, apparentFov: 50 },
  
  // === SKY-WATCHER ===
  { name: "Sky-Watcher Nirvana 16mm", focalLength: 16, apparentFov: 82 },
  { name: "Sky-Watcher Nirvana 7mm", focalLength: 7, apparentFov: 82 },
  { name: "Sky-Watcher Nirvana 4mm", focalLength: 4, apparentFov: 82 },
  
  // === OTHER CLASSICS ===
  { name: "Celestron 6mm Orthoscopic", focalLength: 6, apparentFov: 49 },
  { name: "Celestron 9mm Ortho", focalLength: 9, apparentFov: 49 },
  { name: "Celestron 25mm Orthoscopic", focalLength: 25, apparentFov: 49 },
  { name: "Meade 4.7mm Series 5000", focalLength: 4.7, apparentFov: 82 },
  { name: "Meade 32mm Series 4000", focalLength: 32, apparentFov: 52 },
  { name: "Sky-Watcher 20mm Wide Angle", focalLength: 20, apparentFov: 68 },
  { name: "Zeiss Abbe Orthoscopic 12.5mm", focalLength: 12.5, apparentFov: 50 },
];

// Popular barlows
const popularBarlows = [
  // === TELEVUE POWERMATE (Premium, Telecentric) ===
  { name: "Televue Powermate 2x", factor: 2 },
  { name: "Televue Powermate 2.5x", factor: 2.5 },
  { name: "Televue Powermate 4x", factor: 4 },
  { name: "Televue Powermate 5x", factor: 5 },
  
  // === TELEVUE BARLOW ===
  { name: "Televue 2x Barlow", factor: 2 },
  { name: "Televue 3x Barlow", factor: 3 },
  
  // === EXPLORE SCIENTIFIC ===
  { name: "Explore Scientific 2x Focal Extender", factor: 2 },
  { name: "Explore Scientific 3x Focal Extender", factor: 3 },
  { name: "Explore Scientific 5x Focal Extender", factor: 5 },
  
  // === BAADER ===
  { name: "Baader VIP 2.25x Barlow", factor: 2.25 },
  { name: "Baader Q Barlow 1.3x", factor: 1.3 },
  { name: "Baader Q Barlow 2.25x", factor: 2.25 },
  { name: "Baader Zoom Barlow 1.3x-2.5x", factor: 2 },
  
  // === OTHER POPULAR ===
  { name: "Celestron 1.5x Barlow", factor: 1.5 },
  { name: "Celestron 2x Omni Barlow", factor: 2 },
  { name: "Meade 2x Barlow", factor: 2 },
  { name: "Meade 3x Barlow", factor: 3 },
  { name: "Orion 2x Shorty Barlow", factor: 2 },
  { name: "Sky-Watcher 2x ED Barlow", factor: 2 },
  { name: "GSO 2x ED Barlow", factor: 2 },
  { name: "APM 2.7x ED Barlow", factor: 2.7 },
];

// Popular filters - comprehensive astronomy filter catalog
const popularFilters = [
  // === ASTRONOMIK OIII (User's new filter + variants) ===
  { name: "Astronomik OIII 2\" (Visual)", type: "oiii" as const },
  { name: "Astronomik OIII 1.25\" (Visual)", type: "oiii" as const },
  { name: "Astronomik OIII 12nm 2\"", type: "oiii" as const },
  { name: "Astronomik OIII 12nm 1.25\"", type: "oiii" as const },
  { name: "Astronomik OIII 6nm 2\"", type: "oiii" as const },
  { name: "Astronomik OIII 6nm 1.25\"", type: "oiii" as const },
  
  // === ASTRONOMIK UHC ===
  { name: "Astronomik UHC 2\"", type: "uhc" as const },
  { name: "Astronomik UHC 1.25\"", type: "uhc" as const },
  { name: "Astronomik UHC-E 2\"", type: "uhc" as const },
  { name: "Astronomik UHC-E 1.25\"", type: "uhc" as const },
  
  // === ASTRONOMIK CLS (City Light Suppression) ===
  { name: "Astronomik CLS 2\"", type: "light_pollution" as const },
  { name: "Astronomik CLS 1.25\"", type: "light_pollution" as const },
  { name: "Astronomik CLS-CCD 2\"", type: "light_pollution" as const },
  
  // === ASTRONOMIK H-ALPHA ===
  { name: "Astronomik H-alpha 12nm 2\"", type: "h_alpha" as const },
  { name: "Astronomik H-alpha 6nm 2\"", type: "h_alpha" as const },
  
  // === BAADER FILTERS ===
  { name: "Baader UHC-S 2\"", type: "uhc" as const },
  { name: "Baader UHC-S 1.25\"", type: "uhc" as const },
  { name: "Baader OIII 8.5nm 2\"", type: "oiii" as const },
  { name: "Baader OIII 8.5nm 1.25\"", type: "oiii" as const },
  { name: "Baader H-alpha 7nm 2\"", type: "h_alpha" as const },
  { name: "Baader H-alpha 7nm 1.25\"", type: "h_alpha" as const },
  { name: "Baader H-alpha 35nm 2\"", type: "h_alpha" as const },
  { name: "Baader Neodymium Moon & Skyglow 2\"", type: "moon" as const },
  { name: "Baader Neodymium Moon & Skyglow 1.25\"", type: "moon" as const },
  { name: "Baader Contrast Booster 2\"", type: "light_pollution" as const },
  { name: "Baader Semi-APO 2\"", type: "light_pollution" as const },
  
  // === LUMICON FILTERS ===
  { name: "Lumicon UHC 2\"", type: "uhc" as const },
  { name: "Lumicon UHC 1.25\"", type: "uhc" as const },
  { name: "Lumicon OIII 2\"", type: "oiii" as const },
  { name: "Lumicon OIII 1.25\"", type: "oiii" as const },
  { name: "Lumicon H-Beta 2\"", type: "uhc" as const },
  { name: "Lumicon Light Pollution 2\"", type: "light_pollution" as const },
  { name: "Lumicon Light Pollution 1.25\"", type: "light_pollution" as const },
  
  // === OPTOLONG FILTERS ===
  { name: "Optolong L-eXtreme 2\"", type: "uhc" as const },
  { name: "Optolong L-eXtreme 1.25\"", type: "uhc" as const },
  { name: "Optolong L-eNhance 2\"", type: "uhc" as const },
  { name: "Optolong UHC 2\"", type: "uhc" as const },
  { name: "Optolong UHC 1.25\"", type: "uhc" as const },
  { name: "Optolong OIII 25nm 2\"", type: "oiii" as const },
  { name: "Optolong OIII 6.5nm 2\"", type: "oiii" as const },
  { name: "Optolong H-alpha 7nm 2\"", type: "h_alpha" as const },
  { name: "Optolong CLS 2\"", type: "light_pollution" as const },
  { name: "Optolong L-Pro 2\"", type: "light_pollution" as const },
  
  // === ORION FILTERS ===
  { name: "Orion UltraBlock 2\"", type: "uhc" as const },
  { name: "Orion UltraBlock 1.25\"", type: "uhc" as const },
  { name: "Orion OIII 2\"", type: "oiii" as const },
  { name: "Orion OIII 1.25\"", type: "oiii" as const },
  { name: "Orion SkyGlow 2\"", type: "light_pollution" as const },
  { name: "Orion SkyGlow 1.25\"", type: "light_pollution" as const },
  { name: "Orion Color Filter Set #1", type: "color" as const },
  { name: "Orion Color Filter Set #2", type: "color" as const },
  { name: "Orion Variable Polarizing 1.25\"", type: "moon" as const },
  
  // === CELESTRON FILTERS ===
  { name: "Celestron UHC/LPR 2\"", type: "uhc" as const },
  { name: "Celestron UHC/LPR 1.25\"", type: "uhc" as const },
  { name: "Celestron OIII 2\"", type: "oiii" as const },
  { name: "Celestron OIII 1.25\"", type: "oiii" as const },
  { name: "Celestron Moon Filter 1.25\"", type: "moon" as const },
  { name: "Celestron #94119-A Color Filter Set", type: "color" as const },
  
  // === EXPLORE SCIENTIFIC FILTERS ===
  { name: "Explore Scientific UHC 2\"", type: "uhc" as const },
  { name: "Explore Scientific UHC 1.25\"", type: "uhc" as const },
  { name: "Explore Scientific OIII 2\"", type: "oiii" as const },
  { name: "Explore Scientific OIII 1.25\"", type: "oiii" as const },
  { name: "Explore Scientific H-Beta 2\"", type: "uhc" as const },
  
  // === SVBony FILTERS ===
  { name: "SVBony UHC 2\"", type: "uhc" as const },
  { name: "SVBony UHC 1.25\"", type: "uhc" as const },
  { name: "SVBony CLS 2\"", type: "light_pollution" as const },
  { name: "SVBony OIII 7nm 2\"", type: "oiii" as const },
  { name: "SVBony H-alpha 7nm 2\"", type: "h_alpha" as const },
  
  // === MOON FILTERS ===
  { name: "Orion Moon Filter 1.25\"", type: "moon" as const },
  { name: "Celestron Variable Polarizer 1.25\"", type: "moon" as const },
  { name: "Meade ND96 Moon Filter", type: "moon" as const },
];

// Popular cameras
const popularCameras = [
  // Smartphones
  { name: "iPhone 15 Pro", type: "smartphone" as const, sensorSize: "1 inch" },
  { name: "iPhone 14 Pro", type: "smartphone" as const, sensorSize: "1/1.28 inch" },
  { name: "Samsung Galaxy S24 Ultra", type: "smartphone" as const, sensorSize: "200MP" },
  { name: "Samsung Galaxy S23 Ultra", type: "smartphone" as const, sensorSize: "200MP" },
  { name: "Google Pixel 8 Pro", type: "smartphone" as const, sensorSize: "1/1.31 inch" },
  
  // ZWO Cameras - Deep Sky
  { name: "ZWO ASI2600MC Pro", type: "astrocam" as const, sensorSize: "APS-C Color (IMX571)" },
  { name: "ZWO ASI2600MM Pro", type: "astrocam" as const, sensorSize: "APS-C Mono (IMX571)" },
  { name: "ZWO ASI6200MC Pro", type: "astrocam" as const, sensorSize: "Full Frame Color (IMX455)" },
  { name: "ZWO ASI6200MM Pro", type: "astrocam" as const, sensorSize: "Full Frame Mono (IMX455)" },
  { name: "ZWO ASI533MC Pro", type: "astrocam" as const, sensorSize: "1 inch Color (IMX533)" },
  { name: "ZWO ASI533MM Pro", type: "astrocam" as const, sensorSize: "1 inch Mono (IMX533)" },
  { name: "ZWO ASI585MC Pro", type: "astrocam" as const, sensorSize: "1/1.2 inch Color (IMX585)" },
  { name: "ZWO ASI294MC Pro", type: "astrocam" as const, sensorSize: "4/3 inch Color (IMX294)" },
  { name: "ZWO ASI294MM Pro", type: "astrocam" as const, sensorSize: "4/3 inch Mono (IMX294)" },
  // ZWO Cameras - Planetary
  { name: "ZWO ASI174MM", type: "astrocam" as const, sensorSize: "1/1.2 inch Mono (IMX174)" },
  { name: "ZWO ASI678MC", type: "astrocam" as const, sensorSize: "1/1.8 inch Color (IMX678)" },
  { name: "ZWO ASI662MC", type: "astrocam" as const, sensorSize: "1/3 inch Color (IMX662)" },
  { name: "ZWO ASI224MC", type: "astrocam" as const, sensorSize: "1/3 inch Color (IMX224)" },
  { name: "ZWO ASI120MM Mini", type: "astrocam" as const, sensorSize: "1/3 inch Mono" },
  
  // SVBony Cameras - Deep Sky
  { name: "SVBony SV605CC", type: "astrocam" as const, sensorSize: "1 inch Color (IMX533)" },
  { name: "SVBony SV405CC", type: "astrocam" as const, sensorSize: "4/3 inch Color (IMX294)" },
  // SVBony Cameras - Planetary
  { name: "SVBony SC715C", type: "astrocam" as const, sensorSize: "1/2.8 inch Color (IMX715)" },
  { name: "SVBony SV705C", type: "astrocam" as const, sensorSize: "1/1.2 inch Color (IMX585)" },
  { name: "SVBony SV305", type: "astrocam" as const, sensorSize: "1/2.8 inch Color (IMX290)" },
  { name: "SVBony SV305M Pro", type: "astrocam" as const, sensorSize: "1/2.8 inch Mono (IMX290)" },
  { name: "SVBony SC311", type: "astrocam" as const, sensorSize: "1/3 inch WiFi (IMX662)" },
  
  // QHYCCD Cameras - Deep Sky
  { name: "QHY268M", type: "astrocam" as const, sensorSize: "APS-C Mono (IMX571)" },
  { name: "QHY268C", type: "astrocam" as const, sensorSize: "APS-C Color (IMX571)" },
  { name: "QHY600M", type: "astrocam" as const, sensorSize: "Full Frame Mono (IMX455)" },
  { name: "QHY600C", type: "astrocam" as const, sensorSize: "Full Frame Color (IMX455)" },
  { name: "QHY533M", type: "astrocam" as const, sensorSize: "1 inch Mono (IMX533)" },
  { name: "QHY533C", type: "astrocam" as const, sensorSize: "1 inch Color (IMX533)" },
  { name: "QHY294M Pro", type: "astrocam" as const, sensorSize: "4/3 inch Mono" },
  { name: "QHY294C Pro", type: "astrocam" as const, sensorSize: "4/3 inch Color" },
  { name: "QHY183M", type: "astrocam" as const, sensorSize: "1 inch Mono (IMX183)" },
  { name: "QHY183C", type: "astrocam" as const, sensorSize: "1 inch Color (IMX183)" },
  { name: "QHY461", type: "astrocam" as const, sensorSize: "Medium Format 100MP (IMX461)" },
  { name: "QHY411", type: "astrocam" as const, sensorSize: "Medium Format 150MP (IMX411)" },
  // QHYCCD Cameras - Planetary/Guiding
  { name: "QHY5III462C", type: "astrocam" as const, sensorSize: "1/2.8 inch Color (IMX462)" },
  { name: "QHY5III462M", type: "astrocam" as const, sensorSize: "1/2.8 inch Mono (IMX462)" },
  { name: "QHY5III568M", type: "astrocam" as const, sensorSize: "1/2 inch Mono (IMX568)" },
  { name: "QHY5III678C", type: "astrocam" as const, sensorSize: "1/1.8 inch Color (IMX678)" },
  { name: "QHY5III485C", type: "astrocam" as const, sensorSize: "1/1.2 inch Color (IMX485)" },
  { name: "QHY5III178M", type: "astrocam" as const, sensorSize: "1/1.8 inch Mono (IMX178)" },
  { name: "QHY5III178C", type: "astrocam" as const, sensorSize: "1/1.8 inch Color (IMX178)" },
  
  // Atik Cameras
  { name: "Atik Horizon II Mono", type: "astrocam" as const, sensorSize: "4/3 inch Mono (MN34230)" },
  { name: "Atik Horizon II Color", type: "astrocam" as const, sensorSize: "4/3 inch Color (MN34230)" },
  { name: "Atik ACIS 7.1", type: "astrocam" as const, sensorSize: "1 inch (IMX428)" },
  { name: "Atik ACIS 12.3", type: "astrocam" as const, sensorSize: "4/3 inch 12MP" },
  { name: "Atik Infinity Mono", type: "astrocam" as const, sensorSize: "1/2 inch Mono (ICX825)" },
  { name: "Atik Infinity Color", type: "astrocam" as const, sensorSize: "1/2 inch Color (ICX825)" },
  
  // Starlight Xpress Cameras
  { name: "Starlight Xpress Trius Pro 694", type: "astrocam" as const, sensorSize: "1 inch Mono CCD (ICX694)" },
  { name: "Starlight Xpress Trius Pro 674", type: "astrocam" as const, sensorSize: "1/2 inch Mono CCD (ICX674)" },
  { name: "Starlight Xpress Trius Pro 814", type: "astrocam" as const, sensorSize: "2/3 inch Mono CCD (ICX814)" },
  { name: "Starlight Xpress Trius Pro 834", type: "astrocam" as const, sensorSize: "APS-C Mono CCD (ICX834)" },
  { name: "Starlight Xpress Lodestar X2", type: "astrocam" as const, sensorSize: "1/3 inch Mono CCD" },
  { name: "Starlight Xpress Lodestar Pro", type: "astrocam" as const, sensorSize: "1/3 inch Mono CCD (ICX829)" },
  { name: "Starlight Xpress SX-25C", type: "astrocam" as const, sensorSize: "APS-C Color CCD" },
  { name: "Starlight Xpress SX-35", type: "astrocam" as const, sensorSize: "APS-C Mono CCD 11MP" },
  
  // DSLRs/Mirrorless
  { name: "Canon EOS Ra", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Canon EOS R5", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Canon EOS R6 Mark II", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Canon EOS 6D Mark II", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Canon T7i / 800D", type: "dslr" as const, sensorSize: "APS-C" },
  { name: "Canon T8i / 850D", type: "dslr" as const, sensorSize: "APS-C" },
  { name: "Nikon Z5", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Nikon Z6 III", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Nikon D850", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Nikon D7500", type: "dslr" as const, sensorSize: "APS-C" },
  { name: "Sony A7 IV", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Sony A7C II", type: "dslr" as const, sensorSize: "Full Frame" },
  { name: "Sony A6700", type: "dslr" as const, sensorSize: "APS-C" },
];

// Badge definitions for gamification
const badgeDefinitions = [
  // === OBSERVATION COUNT BADGES ===
  {
    name: "First Light",
    description: "Log your first observation",
    icon: "Star",
    tier: "bronze" as const,
    category: "observation_count" as const,
    requirement: { type: "observation_count", count: 1 },
    points: 10,
    isSecret: false,
  },
  {
    name: "Stargazer",
    description: "Log 10 observations",
    icon: "Stars",
    tier: "bronze" as const,
    category: "observation_count" as const,
    requirement: { type: "observation_count", count: 10 },
    points: 25,
    isSecret: false,
  },
  {
    name: "Amateur Astronomer",
    description: "Log 25 observations",
    icon: "Telescope",
    tier: "silver" as const,
    category: "observation_count" as const,
    requirement: { type: "observation_count", count: 25 },
    points: 50,
    isSecret: false,
  },
  {
    name: "Dedicated Observer",
    description: "Log 50 observations",
    icon: "Eye",
    tier: "gold" as const,
    category: "observation_count" as const,
    requirement: { type: "observation_count", count: 50 },
    points: 100,
    isSecret: false,
  },
  {
    name: "Master Observer",
    description: "Log 100 observations",
    icon: "Crown",
    tier: "platinum" as const,
    category: "observation_count" as const,
    requirement: { type: "observation_count", count: 100 },
    points: 200,
    isSecret: false,
  },

  // === OBJECT TYPE BADGES ===
  {
    name: "Planet Hunter",
    description: "Observe all visible planets (Mars, Jupiter, Saturn, Venus)",
    icon: "Globe",
    tier: "silver" as const,
    category: "object_type" as const,
    requirement: { type: "planets_all", count: 4 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Galaxy Explorer",
    description: "Observe 10 different galaxies",
    icon: "Orbit",
    tier: "silver" as const,
    category: "object_type" as const,
    requirement: { type: "galaxies", count: 10 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Nebula Chaser",
    description: "Observe 10 different nebulae",
    icon: "Cloud",
    tier: "silver" as const,
    category: "object_type" as const,
    requirement: { type: "nebulae", count: 10 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Cluster Collector",
    description: "Observe 15 different star clusters (open or globular)",
    icon: "Sparkles",
    tier: "silver" as const,
    category: "object_type" as const,
    requirement: { type: "clusters", count: 15 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Double Vision",
    description: "Observe 5 double stars",
    icon: "Binary",
    tier: "bronze" as const,
    category: "object_type" as const,
    requirement: { type: "double_stars", count: 5 },
    points: 40,
    isSecret: false,
  },

  // === CATALOG COMPLETION BADGES ===
  {
    name: "Messier Beginner",
    description: "Observe 10 Messier objects",
    icon: "BookOpen",
    tier: "bronze" as const,
    category: "catalog_completion" as const,
    requirement: { type: "messier", count: 10 },
    points: 25,
    isSecret: false,
  },
  {
    name: "Messier Explorer",
    description: "Observe 25 Messier objects",
    icon: "Map",
    tier: "silver" as const,
    category: "catalog_completion" as const,
    requirement: { type: "messier", count: 25 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Messier Hunter",
    description: "Observe 50 Messier objects",
    icon: "Target",
    tier: "gold" as const,
    category: "catalog_completion" as const,
    requirement: { type: "messier", count: 50 },
    points: 150,
    isSecret: false,
  },
  {
    name: "Messier Master",
    description: "Observe 75 Messier objects",
    icon: "Award",
    tier: "gold" as const,
    category: "catalog_completion" as const,
    requirement: { type: "messier", count: 75 },
    points: 250,
    isSecret: false,
  },
  {
    name: "Messier Certificate",
    description: "Complete the entire Messier catalog - all 110 objects observed!",
    icon: "Trophy",
    tier: "special" as const,
    category: "catalog_completion" as const,
    requirement: { type: "messier", count: 110 },
    points: 1000,
    isSecret: false,
  },

  // === IMAGING BADGES ===
  {
    name: "First Shot",
    description: "Upload your first observation photo",
    icon: "Camera",
    tier: "bronze" as const,
    category: "imaging" as const,
    requirement: { type: "photos", count: 1 },
    points: 15,
    isSecret: false,
  },
  {
    name: "Astrophotographer",
    description: "Upload 10 observation photos",
    icon: "Image",
    tier: "silver" as const,
    category: "imaging" as const,
    requirement: { type: "photos", count: 10 },
    points: 50,
    isSecret: false,
  },
  {
    name: "Photo Gallery",
    description: "Upload 25 observation photos",
    icon: "Images",
    tier: "gold" as const,
    category: "imaging" as const,
    requirement: { type: "photos", count: 25 },
    points: 100,
    isSecret: false,
  },

  // === STREAK BADGES ===
  {
    name: "Consistent Observer",
    description: "Observe for 3 days in a row",
    icon: "Flame",
    tier: "bronze" as const,
    category: "streak" as const,
    requirement: { type: "streak", days: 3 },
    points: 30,
    isSecret: false,
  },
  {
    name: "Week Warrior",
    description: "Observe for 7 days in a row",
    icon: "Zap",
    tier: "silver" as const,
    category: "streak" as const,
    requirement: { type: "streak", days: 7 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Night Owl",
    description: "Observe for 14 days in a row",
    icon: "Moon",
    tier: "gold" as const,
    category: "streak" as const,
    requirement: { type: "streak", days: 14 },
    points: 150,
    isSecret: false,
  },

  // === CONDITIONS BADGES ===
  {
    name: "Clear Skies",
    description: "Log an observation with excellent conditions (score 8+)",
    icon: "Sun",
    tier: "bronze" as const,
    category: "conditions" as const,
    requirement: { type: "excellent_conditions", score: 8 },
    points: 20,
    isSecret: false,
  },
  {
    name: "Dark Site Seeker",
    description: "Observe from a Bortle 3 or darker location",
    icon: "Eclipse",
    tier: "silver" as const,
    category: "conditions" as const,
    requirement: { type: "dark_site", bortle: 3 },
    points: 50,
    isSecret: false,
  },
  {
    name: "True Darkness",
    description: "Observe from a Bortle 1 or 2 location",
    icon: "CircleDot",
    tier: "gold" as const,
    category: "conditions" as const,
    requirement: { type: "pristine_site", bortle: 2 },
    points: 100,
    isSecret: false,
  },

  // === SPECIAL/SECRET BADGES ===
  {
    name: "Night Session Pro",
    description: "Complete a session with 5+ different objects in one night",
    icon: "ListChecks",
    tier: "silver" as const,
    category: "special" as const,
    requirement: { type: "multi_object_session", count: 5 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Messier Marathon",
    description: "Observe 20+ Messier objects in a single night",
    icon: "Timer",
    tier: "gold" as const,
    category: "special" as const,
    requirement: { type: "messier_marathon", count: 20 },
    points: 200,
    isSecret: true,
  },
  {
    name: "Full Moon Warrior",
    description: "Successfully observe a DSO during full moon phase",
    icon: "Circle",
    tier: "bronze" as const,
    category: "special" as const,
    requirement: { type: "full_moon_dso" },
    points: 30,
    isSecret: true,
  },
  {
    name: "Early Bird",
    description: "Log an observation before sunrise (astronomical twilight)",
    icon: "Sunrise",
    tier: "bronze" as const,
    category: "special" as const,
    requirement: { type: "early_observation" },
    points: 25,
    isSecret: true,
  },

  // === CELESTIAL EVENT BADGES ===
  {
    name: "Cosmic Alignment",
    description: "Observe your first planetary conjunction",
    icon: "Merge",
    tier: "bronze" as const,
    category: "special" as const,
    requirement: { type: "conjunctions", count: 1 },
    points: 50,
    isSecret: false,
  },
  {
    name: "Conjunction Chaser",
    description: "Observe 3 planetary conjunctions",
    icon: "GitMerge",
    tier: "silver" as const,
    category: "special" as const,
    requirement: { type: "conjunctions", count: 3 },
    points: 100,
    isSecret: false,
  },
  {
    name: "Alignment Expert",
    description: "Observe 5 planetary conjunctions",
    icon: "Combine",
    tier: "gold" as const,
    category: "special" as const,
    requirement: { type: "conjunctions", count: 5 },
    points: 200,
    isSecret: false,
  },
  {
    name: "Opposition Observer",
    description: "Observe your first planet at opposition",
    icon: "CircleDotDashed",
    tier: "silver" as const,
    category: "special" as const,
    requirement: { type: "oppositions", count: 1 },
    points: 75,
    isSecret: false,
  },
  {
    name: "Opposition Hunter",
    description: "Observe 3 planets at opposition",
    icon: "Crosshair",
    tier: "gold" as const,
    category: "special" as const,
    requirement: { type: "oppositions", count: 3 },
    points: 150,
    isSecret: false,
  },
  {
    name: "Meteor Watcher",
    description: "Log an observation during a meteor shower peak",
    icon: "Comet",
    tier: "bronze" as const,
    category: "special" as const,
    requirement: { type: "meteor_showers", count: 1 },
    points: 40,
    isSecret: false,
  },
  {
    name: "Shower Spotter",
    description: "Observe during 3 different meteor shower peaks",
    icon: "Sparkle",
    tier: "silver" as const,
    category: "special" as const,
    requirement: { type: "meteor_showers", count: 3 },
    points: 100,
    isSecret: false,
  },
  {
    name: "Eclipse Witness",
    description: "Observe your first lunar or solar eclipse",
    icon: "Eclipse",
    tier: "gold" as const,
    category: "special" as const,
    requirement: { type: "eclipses", count: 1 },
    points: 150,
    isSecret: false,
  },
  {
    name: "Eclipse Collector",
    description: "Observe 3 eclipses (lunar or solar)",
    icon: "CircleSlash2",
    tier: "platinum" as const,
    category: "special" as const,
    requirement: { type: "eclipses", count: 3 },
    points: 300,
    isSecret: false,
  },
  {
    name: "Rare Event Witness",
    description: "Observe a rare astronomical event (transit, occultation, etc.)",
    icon: "Sparkles",
    tier: "gold" as const,
    category: "special" as const,
    requirement: { type: "rare_events", count: 1 },
    points: 200,
    isSecret: true,
  },
  {
    name: "Event Master",
    description: "Observe 10 celestial events of any type",
    icon: "CalendarStar",
    tier: "platinum" as const,
    category: "special" as const,
    requirement: { type: "total_events", count: 10 },
    points: 500,
    isSecret: false,
  },
];

export async function seedDatabase() {
  console.log("Seeding database with equipment, celestial objects, and badges...");
  
  try {
    // Seed celestial objects
    for (const obj of sampleObjects) {
      await db.insert(celestialObjects).values(obj).onConflictDoNothing();
    }
    console.log(`Seeded ${sampleObjects.length} celestial objects`);
    
    // Seed badges
    for (const badge of badgeDefinitions) {
      await db.insert(badges).values(badge).onConflictDoNothing();
    }
    console.log(`Seeded ${badgeDefinitions.length} badge definitions`);
    
    // Seed popular equipment (seeded without userId for all users to reference)
    // Note: Equipment is user-specific, so we'll seed default popular options
    // that users can select from their equipment library
    
    console.log(`Equipment library ready for users to add from popular selections`);
    console.log("Database seeding complete!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

// Export equipment lists for frontend reference
export { popularTelescopes, popularEyepieces, popularBarlows, popularFilters, popularCameras };

// Run if called directly
seedDatabase().then(() => process.exit(0));
