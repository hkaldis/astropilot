import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const equipmentDatabases = {
  telescopes: [
    // ==========================================
    // CELESTRON - Market Leader
    // ==========================================
    
    // Celestron NexStar SE Series (Best-selling computerized)
    { name: "Celestron NexStar 4SE", aperture: 102, focalLength: 1325, type: "Catadioptric" },
    { name: "Celestron NexStar 5SE", aperture: 127, focalLength: 1250, type: "Catadioptric" },
    { name: "Celestron NexStar 6SE", aperture: 150, focalLength: 1500, type: "Catadioptric" },
    { name: "Celestron NexStar 8SE", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    
    // Celestron NexStar Evolution Series (WiFi enabled)
    { name: "Celestron NexStar Evolution 6", aperture: 150, focalLength: 1500, type: "Catadioptric" },
    { name: "Celestron NexStar Evolution 8", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Celestron NexStar Evolution 9.25", aperture: 235, focalLength: 2350, type: "Catadioptric" },
    
    // Celestron StarSense Explorer Series (Smartphone-guided)
    { name: "Celestron StarSense Explorer LT 70AZ", aperture: 70, focalLength: 700, type: "Refractor" },
    { name: "Celestron StarSense Explorer LT 80AZ", aperture: 80, focalLength: 900, type: "Refractor" },
    { name: "Celestron StarSense Explorer DX 102AZ", aperture: 102, focalLength: 660, type: "Refractor" },
    { name: "Celestron StarSense Explorer DX 130AZ", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Celestron StarSense Explorer LT 114AZ", aperture: 114, focalLength: 1000, type: "Reflector" },
    
    // Celestron AstroMaster Series (Popular beginner)
    { name: "Celestron AstroMaster 70AZ", aperture: 70, focalLength: 900, type: "Refractor" },
    { name: "Celestron AstroMaster 80AZ", aperture: 80, focalLength: 900, type: "Refractor" },
    { name: "Celestron AstroMaster 90AZ", aperture: 90, focalLength: 1000, type: "Refractor" },
    { name: "Celestron AstroMaster 102AZ", aperture: 102, focalLength: 660, type: "Refractor" },
    { name: "Celestron AstroMaster 114EQ", aperture: 114, focalLength: 1000, type: "Reflector" },
    { name: "Celestron AstroMaster 130EQ", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Celestron AstroMaster 130EQ-MD", aperture: 130, focalLength: 650, type: "Reflector" },
    
    // Celestron Inspire Series (Beginner with smartphone adapter)
    { name: "Celestron Inspire 70AZ", aperture: 70, focalLength: 700, type: "Refractor" },
    { name: "Celestron Inspire 80AZ", aperture: 80, focalLength: 900, type: "Refractor" },
    { name: "Celestron Inspire 100AZ", aperture: 100, focalLength: 660, type: "Refractor" },
    
    // Celestron PowerSeeker Series (Entry-level)
    { name: "Celestron PowerSeeker 50AZ", aperture: 50, focalLength: 600, type: "Refractor" },
    { name: "Celestron PowerSeeker 60AZ", aperture: 60, focalLength: 700, type: "Refractor" },
    { name: "Celestron PowerSeeker 70AZ", aperture: 70, focalLength: 700, type: "Refractor" },
    { name: "Celestron PowerSeeker 80AZS", aperture: 80, focalLength: 900, type: "Refractor" },
    { name: "Celestron PowerSeeker 127EQ", aperture: 127, focalLength: 1000, type: "Reflector" },
    
    // Celestron Advanced VX Series (Intermediate astrophotography)
    { name: "Celestron Advanced VX 6\" Newtonian", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Celestron Advanced VX 8\" Newtonian", aperture: 200, focalLength: 1000, type: "Reflector" },
    { name: "Celestron Advanced VX 8\" SCT", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Celestron Advanced VX 9.25\" SCT", aperture: 235, focalLength: 2350, type: "Catadioptric" },
    { name: "Celestron Advanced VX 8\" EdgeHD", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    
    // Celestron CGEM II Series (Advanced)
    { name: "Celestron CGEM II 800", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Celestron CGEM II 925", aperture: 235, focalLength: 2350, type: "Catadioptric" },
    { name: "Celestron CGEM II 1100", aperture: 279, focalLength: 2800, type: "Catadioptric" },
    
    // Celestron CPC Series (Fork-mounted SCT)
    { name: "Celestron CPC 800", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Celestron CPC 925", aperture: 235, focalLength: 2350, type: "Catadioptric" },
    { name: "Celestron CPC 1100", aperture: 279, focalLength: 2800, type: "Catadioptric" },
    { name: "Celestron CPC Deluxe 1100 HD", aperture: 279, focalLength: 2800, type: "Catadioptric" },
    
    // Celestron SLT Series (Computerized, budget-friendly)
    { name: "Celestron NexStar 102 SLT", aperture: 102, focalLength: 660, type: "Refractor" },
    { name: "Celestron NexStar 114 SLT", aperture: 114, focalLength: 1000, type: "Reflector" },
    { name: "Celestron NexStar 127 SLT", aperture: 127, focalLength: 1500, type: "Catadioptric" },
    { name: "Celestron NexStar 130 SLT", aperture: 130, focalLength: 650, type: "Reflector" },
    
    // Celestron Astro Fi Series (WiFi controlled)
    { name: "Celestron Astro Fi 90", aperture: 90, focalLength: 910, type: "Refractor" },
    { name: "Celestron Astro Fi 102", aperture: 102, focalLength: 1325, type: "Catadioptric" },
    { name: "Celestron Astro Fi 130", aperture: 130, focalLength: 650, type: "Reflector" },
    
    // Celestron Schmidt-Cassegrain OTAs
    { name: "Celestron C5 XLT", aperture: 127, focalLength: 1250, type: "Catadioptric" },
    { name: "Celestron C6 XLT", aperture: 150, focalLength: 1500, type: "Catadioptric" },
    { name: "Celestron C8 XLT", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Celestron C9.25 XLT", aperture: 235, focalLength: 2350, type: "Catadioptric" },
    { name: "Celestron C11 XLT", aperture: 279, focalLength: 2800, type: "Catadioptric" },
    { name: "Celestron C14 XLT", aperture: 356, focalLength: 3910, type: "Catadioptric" },
    
    // Celestron EdgeHD OTAs
    { name: "Celestron EdgeHD 800", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Celestron EdgeHD 925", aperture: 235, focalLength: 2350, type: "Catadioptric" },
    { name: "Celestron EdgeHD 1100", aperture: 279, focalLength: 2800, type: "Catadioptric" },
    { name: "Celestron EdgeHD 1400", aperture: 356, focalLength: 3910, type: "Catadioptric" },
    
    // Celestron RASA (Astrophotography)
    { name: "Celestron RASA 8", aperture: 203, focalLength: 400, type: "Catadioptric" },
    { name: "Celestron RASA 11", aperture: 279, focalLength: 620, type: "Catadioptric" },
    { name: "Celestron RASA 36", aperture: 360, focalLength: 790, type: "Catadioptric" },
    
    // ==========================================
    // SKY-WATCHER - Budget Leader
    // ==========================================
    
    // Sky-Watcher Virtuoso GTi Series (Tabletop GoTo)
    { name: "Sky-Watcher Virtuoso GTi 100P", aperture: 100, focalLength: 400, type: "Reflector" },
    { name: "Sky-Watcher Virtuoso GTi 130P", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Sky-Watcher Virtuoso GTi 150P", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Sky-Watcher Virtuoso GTi 150 Mak", aperture: 150, focalLength: 1800, type: "Catadioptric" },
    
    // Sky-Watcher Heritage Series (Tabletop Dobsonians)
    { name: "Sky-Watcher Heritage 76", aperture: 76, focalLength: 300, type: "Reflector" },
    { name: "Sky-Watcher Heritage 100P", aperture: 100, focalLength: 400, type: "Reflector" },
    { name: "Sky-Watcher Heritage 130P", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Sky-Watcher Heritage 150P FlexTube", aperture: 150, focalLength: 750, type: "Reflector" },
    
    // Sky-Watcher Classic Dobsonians
    { name: "Sky-Watcher Classic 150P Dobsonian", aperture: 150, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Classic 200P Dobsonian", aperture: 200, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Classic 250P Dobsonian", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Classic 300P Dobsonian", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "Sky-Watcher Classic 350P Dobsonian", aperture: 355, focalLength: 1600, type: "Reflector" },
    { name: "Sky-Watcher Classic 400P Dobsonian", aperture: 406, focalLength: 1800, type: "Reflector" },
    
    // Sky-Watcher Skyliner Series (Dobsonians)
    { name: "Sky-Watcher Skyliner 150P", aperture: 150, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 200P", aperture: 200, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 250PX", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 300P FlexTube", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 350P FlexTube", aperture: 355, focalLength: 1600, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 400P FlexTube", aperture: 406, focalLength: 1800, type: "Reflector" },
    
    // Sky-Watcher Skyliner GoTo Dobsonians
    { name: "Sky-Watcher Skyliner 200P GoTo", aperture: 200, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 250PX GoTo", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 300P FlexTube GoTo", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "Sky-Watcher Skyliner 400P FlexTube GoTo", aperture: 406, focalLength: 1800, type: "Reflector" },
    
    // Sky-Watcher Explorer Series (EQ mounted Newtonians)
    { name: "Sky-Watcher Explorer 130P", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Sky-Watcher Explorer 150P", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Sky-Watcher Explorer 150PDS", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Sky-Watcher Explorer 200P", aperture: 200, focalLength: 1000, type: "Reflector" },
    { name: "Sky-Watcher Explorer 200PDS", aperture: 200, focalLength: 1000, type: "Reflector" },
    { name: "Sky-Watcher Explorer 250PDS", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Sky-Watcher Explorer 300PDS", aperture: 305, focalLength: 1500, type: "Reflector" },
    
    // Sky-Watcher Evostar Series (Refractors)
    { name: "Sky-Watcher Evostar 72ED", aperture: 72, focalLength: 420, type: "Refractor" },
    { name: "Sky-Watcher Evostar 80ED", aperture: 80, focalLength: 600, type: "Refractor" },
    { name: "Sky-Watcher Evostar 100ED", aperture: 100, focalLength: 900, type: "Refractor" },
    { name: "Sky-Watcher Evostar 120ED", aperture: 120, focalLength: 900, type: "Refractor" },
    { name: "Sky-Watcher Evostar 150DX", aperture: 150, focalLength: 1200, type: "Refractor" },
    
    // Sky-Watcher Esprit Series (Premium APO refractors)
    { name: "Sky-Watcher Esprit 80ED Pro", aperture: 80, focalLength: 400, type: "Refractor" },
    { name: "Sky-Watcher Esprit 100ED Pro", aperture: 100, focalLength: 550, type: "Refractor" },
    { name: "Sky-Watcher Esprit 120ED Pro", aperture: 120, focalLength: 840, type: "Refractor" },
    { name: "Sky-Watcher Esprit 150ED Pro", aperture: 150, focalLength: 1050, type: "Refractor" },
    
    // Sky-Watcher Maksutov-Cassegrains
    { name: "Sky-Watcher Skymax 90", aperture: 90, focalLength: 1250, type: "Catadioptric" },
    { name: "Sky-Watcher Skymax 102", aperture: 102, focalLength: 1300, type: "Catadioptric" },
    { name: "Sky-Watcher Skymax 127", aperture: 127, focalLength: 1500, type: "Catadioptric" },
    { name: "Sky-Watcher Skymax 150 Pro", aperture: 150, focalLength: 1800, type: "Catadioptric" },
    { name: "Sky-Watcher Skymax 180 Pro", aperture: 180, focalLength: 2700, type: "Catadioptric" },
    
    // Sky-Watcher Star Quest Series (Beginner)
    { name: "Sky-Watcher Star Quest 70R", aperture: 70, focalLength: 700, type: "Refractor" },
    { name: "Sky-Watcher Star Quest 102R", aperture: 102, focalLength: 500, type: "Refractor" },
    { name: "Sky-Watcher Star Quest 114P", aperture: 114, focalLength: 500, type: "Reflector" },
    { name: "Sky-Watcher Star Quest 130P", aperture: 130, focalLength: 650, type: "Reflector" },
    
    // Sky-Watcher AZ-GTi Series
    { name: "Sky-Watcher AZ-GTi 102", aperture: 102, focalLength: 500, type: "Refractor" },
    { name: "Sky-Watcher AZ-GTi 114", aperture: 114, focalLength: 500, type: "Reflector" },
    { name: "Sky-Watcher AZ-GTi 127 Mak", aperture: 127, focalLength: 1500, type: "Catadioptric" },
    
    // ==========================================
    // ORION - Strong Competitor
    // ==========================================
    
    // Orion SkyQuest XT Dobsonian Series
    { name: "Orion SkyQuest XT4.5 Classic", aperture: 114, focalLength: 500, type: "Reflector" },
    { name: "Orion SkyQuest XT6 Classic", aperture: 150, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT6 Plus", aperture: 150, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT8 Classic", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT8 Plus", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT8i IntelliScope", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT10 Classic", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT10 Plus", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT10i IntelliScope", aperture: 254, focalLength: 1200, type: "Reflector" },
    { name: "Orion SkyQuest XT12 Classic", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "Orion SkyQuest XT12i IntelliScope", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "Orion SkyQuest XX14i IntelliScope", aperture: 355, focalLength: 1650, type: "Reflector" },
    { name: "Orion SkyQuest XX16g GoTo Truss", aperture: 406, focalLength: 1800, type: "Reflector" },
    
    // Orion StarBlast Series (Tabletop)
    { name: "Orion StarBlast 4.5 Astro", aperture: 114, focalLength: 450, type: "Reflector" },
    { name: "Orion StarBlast 6 Astro", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Orion StarBlast 6i IntelliScope", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Orion StarBlast II 4.5 EQ", aperture: 114, focalLength: 450, type: "Reflector" },
    
    // Orion AstroView Series
    { name: "Orion AstroView 90mm EQ", aperture: 90, focalLength: 910, type: "Refractor" },
    { name: "Orion AstroView 120ST EQ", aperture: 120, focalLength: 600, type: "Refractor" },
    { name: "Orion AstroView 6\" EQ", aperture: 150, focalLength: 750, type: "Reflector" },
    
    // Orion SpaceProbe Series
    { name: "Orion SpaceProbe 3 EQ", aperture: 76, focalLength: 700, type: "Reflector" },
    { name: "Orion SpaceProbe 130ST EQ", aperture: 130, focalLength: 650, type: "Reflector" },
    
    // Orion Observer Series
    { name: "Orion Observer 60mm AZ", aperture: 60, focalLength: 700, type: "Refractor" },
    { name: "Orion Observer 70mm AZ", aperture: 70, focalLength: 700, type: "Refractor" },
    { name: "Orion Observer 80ST", aperture: 80, focalLength: 400, type: "Refractor" },
    
    // Orion SkyScanner Series
    { name: "Orion SkyScanner 100mm", aperture: 100, focalLength: 400, type: "Reflector" },
    { name: "Orion FunScope 76mm", aperture: 76, focalLength: 300, type: "Reflector" },
    
    // Orion ED Refractors
    { name: "Orion ED80 APO", aperture: 80, focalLength: 600, type: "Refractor" },
    { name: "Orion ED80T CF", aperture: 80, focalLength: 480, type: "Refractor" },
    { name: "Orion EON 115mm ED", aperture: 115, focalLength: 805, type: "Refractor" },
    { name: "Orion EON 130mm ED", aperture: 130, focalLength: 910, type: "Refractor" },
    
    // Orion SkyView Pro Series
    { name: "Orion SkyView Pro 8\" EQ", aperture: 203, focalLength: 1000, type: "Reflector" },
    { name: "Orion SkyView Pro 120 EQ", aperture: 120, focalLength: 1000, type: "Refractor" },
    
    // Orion Sirius Series
    { name: "Orion Sirius ED80 EQ-G", aperture: 80, focalLength: 600, type: "Refractor" },
    { name: "Orion Sirius 8\" EQ-G", aperture: 203, focalLength: 1000, type: "Reflector" },
    
    // Orion StarSeeker IV GoTo
    { name: "Orion StarSeeker IV 114mm GoTo", aperture: 114, focalLength: 450, type: "Reflector" },
    { name: "Orion StarSeeker IV 127mm Mak GoTo", aperture: 127, focalLength: 1500, type: "Catadioptric" },
    { name: "Orion StarSeeker IV 150mm GoTo", aperture: 150, focalLength: 750, type: "Reflector" },
    
    // ==========================================
    // MEADE - Established Player
    // ==========================================
    
    // Meade ETX Series (Portable Maksutov)
    { name: "Meade ETX-90 Observer", aperture: 90, focalLength: 1250, type: "Catadioptric" },
    { name: "Meade ETX-105 Observer", aperture: 105, focalLength: 1470, type: "Catadioptric" },
    { name: "Meade ETX-125 Observer", aperture: 127, focalLength: 1900, type: "Catadioptric" },
    
    // Meade LX Series
    { name: "Meade LX65 6\" ACF", aperture: 150, focalLength: 1524, type: "Catadioptric" },
    { name: "Meade LX65 8\" ACF", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Meade LX85 6\" ACF", aperture: 150, focalLength: 1524, type: "Catadioptric" },
    { name: "Meade LX85 8\" ACF", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Meade LX90 8\" ACF", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Meade LX90 10\" ACF", aperture: 254, focalLength: 2540, type: "Catadioptric" },
    { name: "Meade LX90 12\" ACF", aperture: 305, focalLength: 3048, type: "Catadioptric" },
    { name: "Meade LX200 8\" ACF", aperture: 203, focalLength: 2032, type: "Catadioptric" },
    { name: "Meade LX200 10\" ACF", aperture: 254, focalLength: 2540, type: "Catadioptric" },
    { name: "Meade LX200 12\" ACF", aperture: 305, focalLength: 3048, type: "Catadioptric" },
    { name: "Meade LX200 14\" ACF", aperture: 356, focalLength: 3556, type: "Catadioptric" },
    { name: "Meade LX200 16\" ACF", aperture: 406, focalLength: 4064, type: "Catadioptric" },
    { name: "Meade LX600 12\" ACF", aperture: 305, focalLength: 2438, type: "Catadioptric" },
    { name: "Meade LX600 14\" ACF", aperture: 356, focalLength: 2845, type: "Catadioptric" },
    { name: "Meade LX600 16\" ACF", aperture: 406, focalLength: 3251, type: "Catadioptric" },
    
    // Meade Lightbridge Series (Truss Dobsonians)
    { name: "Meade Lightbridge 8\"", aperture: 203, focalLength: 1219, type: "Reflector" },
    { name: "Meade Lightbridge 10\"", aperture: 254, focalLength: 1270, type: "Reflector" },
    { name: "Meade Lightbridge 12\"", aperture: 305, focalLength: 1524, type: "Reflector" },
    { name: "Meade Lightbridge 16\"", aperture: 406, focalLength: 1829, type: "Reflector" },
    
    // Meade StarNavigator NG
    { name: "Meade StarNavigator NG 90mm", aperture: 90, focalLength: 1000, type: "Refractor" },
    { name: "Meade StarNavigator NG 102mm", aperture: 102, focalLength: 660, type: "Refractor" },
    { name: "Meade StarNavigator NG 114mm", aperture: 114, focalLength: 1000, type: "Reflector" },
    { name: "Meade StarNavigator NG 130mm", aperture: 130, focalLength: 1000, type: "Reflector" },
    
    // Meade Polaris Series
    { name: "Meade Polaris 70mm EQ", aperture: 70, focalLength: 900, type: "Refractor" },
    { name: "Meade Polaris 80mm EQ", aperture: 80, focalLength: 900, type: "Refractor" },
    { name: "Meade Polaris 90mm EQ", aperture: 90, focalLength: 1000, type: "Refractor" },
    { name: "Meade Polaris 114mm EQ", aperture: 114, focalLength: 1000, type: "Reflector" },
    { name: "Meade Polaris 127mm EQ", aperture: 127, focalLength: 1000, type: "Reflector" },
    { name: "Meade Polaris 130mm EQ", aperture: 130, focalLength: 650, type: "Reflector" },
    
    // Meade Infinity Series
    { name: "Meade Infinity 50mm", aperture: 50, focalLength: 600, type: "Refractor" },
    { name: "Meade Infinity 60mm AZ", aperture: 60, focalLength: 800, type: "Refractor" },
    { name: "Meade Infinity 70mm AZ", aperture: 70, focalLength: 700, type: "Refractor" },
    { name: "Meade Infinity 80mm AZ", aperture: 80, focalLength: 400, type: "Refractor" },
    { name: "Meade Infinity 102mm AZ", aperture: 102, focalLength: 600, type: "Refractor" },
    
    // ==========================================
    // EXPLORE SCIENTIFIC
    // ==========================================
    
    // Explore Scientific FirstLight Dobsonians
    { name: "Explore Scientific FirstLight 8\" Dob", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "Explore Scientific FirstLight 10\" Dob", aperture: 254, focalLength: 1270, type: "Reflector" },
    { name: "Explore Scientific FirstLight 12\" Dob", aperture: 305, focalLength: 1524, type: "Reflector" },
    
    // Explore Scientific Refractors
    { name: "Explore Scientific ED80 Essential", aperture: 80, focalLength: 480, type: "Refractor" },
    { name: "Explore Scientific ED102 Essential", aperture: 102, focalLength: 714, type: "Refractor" },
    { name: "Explore Scientific ED127 Essential", aperture: 127, focalLength: 952, type: "Refractor" },
    { name: "Explore Scientific ED127 CF", aperture: 127, focalLength: 952, type: "Refractor" },
    { name: "Explore Scientific FCD100 Series 80mm", aperture: 80, focalLength: 480, type: "Refractor" },
    { name: "Explore Scientific FCD100 Series 102mm", aperture: 102, focalLength: 714, type: "Refractor" },
    { name: "Explore Scientific FCD100 Series 127mm", aperture: 127, focalLength: 952, type: "Refractor" },
    { name: "Explore Scientific 152mm FCD100", aperture: 152, focalLength: 1216, type: "Refractor" },
    
    // ==========================================
    // TAKAHASHI - Premium Japanese
    // ==========================================
    
    { name: "Takahashi FSQ-85EDX4", aperture: 85, focalLength: 450, type: "Refractor" },
    { name: "Takahashi FSQ-106EDX4", aperture: 106, focalLength: 530, type: "Refractor" },
    { name: "Takahashi FC-76DCU", aperture: 76, focalLength: 570, type: "Refractor" },
    { name: "Takahashi FC-100DC", aperture: 100, focalLength: 740, type: "Refractor" },
    { name: "Takahashi FC-100DZ", aperture: 100, focalLength: 800, type: "Refractor" },
    { name: "Takahashi TOA-130", aperture: 130, focalLength: 1000, type: "Refractor" },
    { name: "Takahashi TOA-150B", aperture: 150, focalLength: 1100, type: "Refractor" },
    { name: "Takahashi TSA-120", aperture: 120, focalLength: 900, type: "Refractor" },
    { name: "Takahashi Mewlon 180C", aperture: 180, focalLength: 2160, type: "Catadioptric" },
    { name: "Takahashi Mewlon 210", aperture: 210, focalLength: 2415, type: "Catadioptric" },
    { name: "Takahashi Mewlon 250CRS", aperture: 250, focalLength: 2500, type: "Catadioptric" },
    { name: "Takahashi Epsilon 130D", aperture: 130, focalLength: 430, type: "Reflector" },
    { name: "Takahashi Epsilon 180ED", aperture: 180, focalLength: 500, type: "Reflector" },
    
    // ==========================================
    // WILLIAM OPTICS - Premium Refractors
    // ==========================================
    
    { name: "William Optics Zenithstar 61 II", aperture: 61, focalLength: 360, type: "Refractor" },
    { name: "William Optics Zenithstar 73 II", aperture: 73, focalLength: 430, type: "Refractor" },
    { name: "William Optics Zenithstar 81 II", aperture: 81, focalLength: 478, type: "Refractor" },
    { name: "William Optics RedCat 51", aperture: 51, focalLength: 250, type: "Refractor" },
    { name: "William Optics RedCat 71", aperture: 71, focalLength: 350, type: "Refractor" },
    { name: "William Optics SpaceCat 51", aperture: 51, focalLength: 250, type: "Refractor" },
    { name: "William Optics GT71", aperture: 71, focalLength: 418, type: "Refractor" },
    { name: "William Optics GT81", aperture: 81, focalLength: 478, type: "Refractor" },
    { name: "William Optics FluoroStar 91", aperture: 91, focalLength: 540, type: "Refractor" },
    { name: "William Optics FluoroStar 120", aperture: 120, focalLength: 720, type: "Refractor" },
    { name: "William Optics FluoroStar 132", aperture: 132, focalLength: 925, type: "Refractor" },
    { name: "William Optics FluoroStar 156", aperture: 156, focalLength: 1030, type: "Refractor" },
    
    // ==========================================
    // VIXEN - Japanese Quality
    // ==========================================
    
    { name: "Vixen A80Mf", aperture: 80, focalLength: 910, type: "Refractor" },
    { name: "Vixen A105MII", aperture: 105, focalLength: 1000, type: "Refractor" },
    { name: "Vixen SD81S", aperture: 81, focalLength: 625, type: "Refractor" },
    { name: "Vixen SD103S", aperture: 103, focalLength: 795, type: "Refractor" },
    { name: "Vixen SD115S", aperture: 115, focalLength: 890, type: "Refractor" },
    { name: "Vixen AX103S", aperture: 103, focalLength: 825, type: "Refractor" },
    { name: "Vixen R130Sf", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Vixen R200SS", aperture: 200, focalLength: 800, type: "Reflector" },
    { name: "Vixen VC200L", aperture: 200, focalLength: 1800, type: "Catadioptric" },
    { name: "Vixen VMC95L", aperture: 95, focalLength: 1050, type: "Catadioptric" },
    { name: "Vixen VMC110L", aperture: 110, focalLength: 1035, type: "Catadioptric" },
    { name: "Vixen VMC200L", aperture: 200, focalLength: 1950, type: "Catadioptric" },
    { name: "Vixen VMC260L", aperture: 260, focalLength: 3000, type: "Catadioptric" },
    
    // ==========================================
    // APERTURA - Value Dobsonians
    // ==========================================
    
    { name: "Apertura AD8 Dobsonian", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "Apertura AD10 Dobsonian", aperture: 254, focalLength: 1250, type: "Reflector" },
    { name: "Apertura AD12 Dobsonian", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "Apertura DT8 Truss Dob", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "Apertura DT10 Truss Dob", aperture: 254, focalLength: 1250, type: "Reflector" },
    { name: "Apertura DT12 Truss Dob", aperture: 305, focalLength: 1500, type: "Reflector" },
    
    // ==========================================
    // GSO - OEM/Value
    // ==========================================
    
    { name: "GSO 6\" Dobsonian", aperture: 150, focalLength: 1200, type: "Reflector" },
    { name: "GSO 8\" Dobsonian", aperture: 203, focalLength: 1200, type: "Reflector" },
    { name: "GSO 10\" Dobsonian", aperture: 254, focalLength: 1250, type: "Reflector" },
    { name: "GSO 12\" Dobsonian", aperture: 305, focalLength: 1500, type: "Reflector" },
    { name: "GSO 8\" Ritchey-Chretien", aperture: 203, focalLength: 1624, type: "Catadioptric" },
    { name: "GSO 10\" Ritchey-Chretien", aperture: 254, focalLength: 2000, type: "Catadioptric" },
    { name: "GSO 12\" Ritchey-Chretien", aperture: 305, focalLength: 2432, type: "Catadioptric" },
    
    // ==========================================
    // BRESSER - European Brand
    // ==========================================
    
    { name: "Bresser Messier AR-102L", aperture: 102, focalLength: 1000, type: "Refractor" },
    { name: "Bresser Messier AR-127L", aperture: 127, focalLength: 1200, type: "Refractor" },
    { name: "Bresser Messier NT-130S", aperture: 130, focalLength: 650, type: "Reflector" },
    { name: "Bresser Messier NT-150S", aperture: 150, focalLength: 750, type: "Reflector" },
    { name: "Bresser Messier NT-203", aperture: 203, focalLength: 1000, type: "Reflector" },
    { name: "Bresser Messier MC-100", aperture: 100, focalLength: 1400, type: "Catadioptric" },
    { name: "Bresser Messier MC-127", aperture: 127, focalLength: 1900, type: "Catadioptric" },
    { name: "Bresser Messier 8\" Dobsonian", aperture: 203, focalLength: 1218, type: "Reflector" },
    { name: "Bresser Messier 10\" Dobsonian", aperture: 254, focalLength: 1270, type: "Reflector" },
    
    // ==========================================
    // SHARPSTAR / ASKAR - Astrophotography
    // ==========================================
    
    { name: "Sharpstar 61EDPH II", aperture: 61, focalLength: 274, type: "Refractor" },
    { name: "Sharpstar 76EDPH", aperture: 76, focalLength: 418, type: "Refractor" },
    { name: "Sharpstar 94EDPH", aperture: 94, focalLength: 517, type: "Refractor" },
    { name: "Askar FRA300 Pro", aperture: 60, focalLength: 300, type: "Refractor" },
    { name: "Askar FRA400", aperture: 72, focalLength: 400, type: "Refractor" },
    { name: "Askar FRA500", aperture: 90, focalLength: 500, type: "Refractor" },
    { name: "Askar FRA600", aperture: 108, focalLength: 600, type: "Refractor" },
    { name: "Askar 80PHQ", aperture: 80, focalLength: 440, type: "Refractor" },
    { name: "Askar 103APO", aperture: 103, focalLength: 565, type: "Refractor" },
    { name: "Askar 107PHQ", aperture: 107, focalLength: 749, type: "Refractor" },
    { name: "Askar 130PHQ", aperture: 130, focalLength: 780, type: "Refractor" },
    { name: "Askar 151PHQ", aperture: 151, focalLength: 1057, type: "Refractor" },
    
    // ==========================================
    // SMART TELESCOPES
    // ==========================================
    
    { name: "ZWO Seestar S50", aperture: 50, focalLength: 250, type: "Refractor" },
    { name: "ZWO Seestar S30", aperture: 40, focalLength: 200, type: "Refractor" },
    { name: "Unistellar eQuinox 2", aperture: 114, focalLength: 450, type: "Reflector" },
    { name: "Unistellar eVscope 2", aperture: 114, focalLength: 450, type: "Reflector" },
    { name: "Unistellar Odyssey", aperture: 85, focalLength: 320, type: "Reflector" },
    { name: "Unistellar Odyssey Pro", aperture: 85, focalLength: 320, type: "Reflector" },
    { name: "Vaonis Stellina", aperture: 80, focalLength: 400, type: "Refractor" },
    { name: "Vaonis Vespera", aperture: 50, focalLength: 200, type: "Refractor" },
    { name: "Vaonis Vespera Pro", aperture: 62, focalLength: 250, type: "Refractor" },
    { name: "Vaonis Hyperia", aperture: 150, focalLength: 540, type: "Reflector" },
    { name: "Dwarf II Smart Telescope", aperture: 24, focalLength: 100, type: "Refractor" },
    { name: "Dwarf 3 Smart Telescope", aperture: 32, focalLength: 120, type: "Refractor" },
    
    // ==========================================
    // ASTRO-PHYSICS - Ultra Premium
    // ==========================================
    
    { name: "Astro-Physics Stowaway 92mm", aperture: 92, focalLength: 644, type: "Refractor" },
    { name: "Astro-Physics Traveler 105mm", aperture: 105, focalLength: 735, type: "Refractor" },
    { name: "Astro-Physics 130mm StarFire GTX", aperture: 130, focalLength: 780, type: "Refractor" },
    { name: "Astro-Physics 140mm StarFire", aperture: 140, focalLength: 980, type: "Refractor" },
    { name: "Astro-Physics 155mm StarFire EDF", aperture: 155, focalLength: 1085, type: "Refractor" },
    { name: "Astro-Physics 175mm StarFire EDF", aperture: 175, focalLength: 1225, type: "Refractor" },
    
    // ==========================================
    // SKYWATCHER QUATTRO (Imaging Newtonians)
    // ==========================================
    
    { name: "Sky-Watcher Quattro 150P", aperture: 150, focalLength: 600, type: "Reflector" },
    { name: "Sky-Watcher Quattro 200P", aperture: 200, focalLength: 800, type: "Reflector" },
    { name: "Sky-Watcher Quattro 250P", aperture: 254, focalLength: 1000, type: "Reflector" },
    { name: "Sky-Watcher Quattro 300P", aperture: 305, focalLength: 1200, type: "Reflector" },
    
    // ==========================================
    // SVBONY - Budget Astrophotography
    // ==========================================
    
    { name: "SVBony SV503 70ED", aperture: 70, focalLength: 420, type: "Refractor" },
    { name: "SVBony SV503 80ED", aperture: 80, focalLength: 560, type: "Refractor" },
    { name: "SVBony SV503 102ED", aperture: 102, focalLength: 714, type: "Refractor" },
    { name: "SVBony SV550 80mm f/6", aperture: 80, focalLength: 480, type: "Refractor" },
    { name: "SVBony SV550 122mm f/7", aperture: 122, focalLength: 854, type: "Refractor" },
  ],
  
  eyepieces: [
    // === EXPLORE SCIENTIFIC 82° SERIES (Ultra-wide, waterproof) ===
    { name: "Explore Scientific 82° 30mm", focalLength: 30, apparentFov: 82 },
    { name: "Explore Scientific 82° 24mm", focalLength: 24, apparentFov: 82 },
    { name: "Explore Scientific 82° 18mm", focalLength: 18, apparentFov: 82 },
    { name: "Explore Scientific 82° 14mm", focalLength: 14, apparentFov: 82 },
    { name: "Explore Scientific 82° 11mm", focalLength: 11, apparentFov: 82 },
    { name: "Explore Scientific 82° 8.8mm", focalLength: 8.8, apparentFov: 82 },
    { name: "Explore Scientific 82° 6.7mm", focalLength: 6.7, apparentFov: 82 },
    { name: "Explore Scientific 82° 4.7mm", focalLength: 4.7, apparentFov: 82 },
    { name: "Explore Scientific 82° 8.5mm LER", focalLength: 8.5, apparentFov: 82 },
    { name: "Explore Scientific 82° 6.5mm LER", focalLength: 6.5, apparentFov: 82 },
    { name: "Explore Scientific 82° 4.5mm LER", focalLength: 4.5, apparentFov: 82 },
    
    // === EXPLORE SCIENTIFIC 100° SERIES (Premium ultra-wide) ===
    { name: "Explore Scientific 100° 25mm", focalLength: 25, apparentFov: 100 },
    { name: "Explore Scientific 100° 20mm", focalLength: 20, apparentFov: 100 },
    { name: "Explore Scientific 100° 14mm", focalLength: 14, apparentFov: 100 },
    { name: "Explore Scientific 100° 9mm", focalLength: 9, apparentFov: 100 },
    { name: "Explore Scientific 100° 5.5mm", focalLength: 5.5, apparentFov: 100 },
    
    // === EXPLORE SCIENTIFIC 68° SERIES ===
    { name: "Explore Scientific 68° 24mm", focalLength: 24, apparentFov: 68 },
    { name: "Explore Scientific 68° 20mm", focalLength: 20, apparentFov: 68 },
    { name: "Explore Scientific 68° 16mm", focalLength: 16, apparentFov: 68 },
    { name: "Explore Scientific 68° 12mm", focalLength: 12, apparentFov: 68 },
    { name: "Explore Scientific 68° 7mm", focalLength: 7, apparentFov: 68 },
    
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
    { name: "Baader Hyperion Zoom 8-24mm", focalLength: 16, apparentFov: 68 },
    
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
  ],
  
  barlows: [
    // === TELEVUE POWERMATE (Premium, Telecentric) ===
    { name: "Televue Powermate 2x", factor: 2 },
    { name: "Televue Powermate 2.5x", factor: 2.5 },
    { name: "Televue Powermate 4x", factor: 4 },
    { name: "Televue Powermate 5x", factor: 5 },
    
    // === TELEVUE BARLOW ===
    { name: "Televue 2x Barlow", factor: 2 },
    { name: "Televue 3x Barlow", factor: 3 },
    { name: "Televue Big Barlow 2x", factor: 2 },
    
    // === EXPLORE SCIENTIFIC ===
    { name: "Explore Scientific 2x Focal Extender", factor: 2 },
    { name: "Explore Scientific 3x Focal Extender", factor: 3 },
    { name: "Explore Scientific 5x Focal Extender", factor: 5 },
    
    // === BAADER Q-TURRET ===
    { name: "Baader Q Barlow 1.3x", factor: 1.3 },
    { name: "Baader Q Barlow 2.25x", factor: 2.25 },
    { name: "Baader VIP 2.25x Barlow", factor: 2.25 },
    { name: "Baader Zoom Barlow 1.3x-2.5x", factor: 2 },
    
    // === BAADER OTHER ===
    { name: "Baader 2x ED Barlow", factor: 2 },
    { name: "Baader Hyperion 2.25x Barlow", factor: 2.25 },
    
    // === CELESTRON ===
    { name: "Celestron 1.5x Barlow", factor: 1.5 },
    { name: "Celestron 2x Omni Barlow", factor: 2 },
    { name: "Celestron 2x Ultima Barlow", factor: 2 },
    { name: "Celestron 3x X-Cel LX Barlow", factor: 3 },
    
    // === SKY-WATCHER ===
    { name: "Sky-Watcher 2x ED Barlow", factor: 2 },
    { name: "Sky-Watcher 2.5x Barlow", factor: 2.5 },
    
    // === ORION ===
    { name: "Orion 1.5x Shorty Barlow", factor: 1.5 },
    { name: "Orion 2x Shorty Barlow", factor: 2 },
    { name: "Orion 3x Shorty Barlow", factor: 3 },
    
    // === MEADE ===
    { name: "Meade 2x Barlow", factor: 2 },
    { name: "Meade 3x Barlow", factor: 3 },
    
    // === OTHER PREMIUM ===
    { name: "GSO 2x ED Barlow", factor: 2 },
    { name: "APM 2.7x ED Barlow", factor: 2.7 },
  ],
  
  filters: [
    // === ASTRONOMIK OIII (Visual & Photographic) ===
    { name: "Astronomik OIII 2\" (Visual)", type: "oiii" },
    { name: "Astronomik OIII 1.25\" (Visual)", type: "oiii" },
    { name: "Astronomik OIII 12nm 2\"", type: "oiii" },
    { name: "Astronomik OIII 12nm 1.25\"", type: "oiii" },
    { name: "Astronomik OIII 6nm 2\"", type: "oiii" },
    { name: "Astronomik OIII 6nm 1.25\"", type: "oiii" },
    
    // === ASTRONOMIK UHC ===
    { name: "Astronomik UHC 2\"", type: "uhc" },
    { name: "Astronomik UHC 1.25\"", type: "uhc" },
    { name: "Astronomik UHC-E 2\"", type: "uhc" },
    { name: "Astronomik UHC-E 1.25\"", type: "uhc" },
    
    // === ASTRONOMIK CLS (City Light Suppression) ===
    { name: "Astronomik CLS 2\"", type: "light_pollution" },
    { name: "Astronomik CLS 1.25\"", type: "light_pollution" },
    { name: "Astronomik CLS-CCD 2\"", type: "light_pollution" },
    
    // === ASTRONOMIK H-ALPHA ===
    { name: "Astronomik H-alpha 12nm 2\"", type: "h_alpha" },
    { name: "Astronomik H-alpha 6nm 2\"", type: "h_alpha" },
    
    // === BAADER OIII ===
    { name: "Baader OIII 8.5nm 2\"", type: "oiii" },
    { name: "Baader OIII 8.5nm 1.25\"", type: "oiii" },
    { name: "Baader OIII 10nm 2\"", type: "oiii" },
    
    // === BAADER UHC ===
    { name: "Baader UHC-S 2\"", type: "uhc" },
    { name: "Baader UHC-S 1.25\"", type: "uhc" },
    
    // === BAADER H-ALPHA ===
    { name: "Baader H-alpha 7nm 2\"", type: "h_alpha" },
    { name: "Baader H-alpha 7nm 1.25\"", type: "h_alpha" },
    { name: "Baader H-alpha 35nm 2\"", type: "h_alpha" },
    
    // === BAADER OTHER ===
    { name: "Baader Neodymium Moon & Skyglow 2\"", type: "moon" },
    { name: "Baader Neodymium Moon & Skyglow 1.25\"", type: "moon" },
    { name: "Baader Contrast Booster 2\"", type: "light_pollution" },
    { name: "Baader Semi-APO 2\"", type: "light_pollution" },
    
    // === LUMICON OIII ===
    { name: "Lumicon OIII 2\"", type: "oiii" },
    { name: "Lumicon OIII 1.25\"", type: "oiii" },
    
    // === LUMICON UHC ===
    { name: "Lumicon UHC 2\"", type: "uhc" },
    { name: "Lumicon UHC 1.25\"", type: "uhc" },
    { name: "Lumicon H-Beta 2\"", type: "uhc" },
    { name: "Lumicon H-Beta 1.25\"", type: "uhc" },
    
    // === LUMICON OTHER ===
    { name: "Lumicon Light Pollution 2\"", type: "light_pollution" },
    { name: "Lumicon Light Pollution 1.25\"", type: "light_pollution" },
    
    // === OPTOLONG OIII ===
    { name: "Optolong OIII 25nm 2\"", type: "oiii" },
    { name: "Optolong OIII 6.5nm 2\"", type: "oiii" },
    { name: "Optolong OIII 6.5nm 1.25\"", type: "oiii" },
    
    // === OPTOLONG UHC / Dual-Band ===
    { name: "Optolong L-eXtreme 2\"", type: "uhc" },
    { name: "Optolong L-eXtreme 1.25\"", type: "uhc" },
    { name: "Optolong L-eNhance 2\"", type: "uhc" },
    { name: "Optolong L-eNhance 1.25\"", type: "uhc" },
    { name: "Optolong UHC 2\"", type: "uhc" },
    { name: "Optolong UHC 1.25\"", type: "uhc" },
    
    // === OPTOLONG H-ALPHA ===
    { name: "Optolong H-alpha 7nm 2\"", type: "h_alpha" },
    { name: "Optolong H-alpha 7nm 1.25\"", type: "h_alpha" },
    
    // === OPTOLONG LIGHT POLLUTION ===
    { name: "Optolong CLS 2\"", type: "light_pollution" },
    { name: "Optolong CLS 1.25\"", type: "light_pollution" },
    { name: "Optolong L-Pro 2\"", type: "light_pollution" },
    { name: "Optolong L-Pro 1.25\"", type: "light_pollution" },
    
    // === ORION OIII ===
    { name: "Orion OIII 2\"", type: "oiii" },
    { name: "Orion OIII 1.25\"", type: "oiii" },
    
    // === ORION UHC ===
    { name: "Orion UltraBlock 2\"", type: "uhc" },
    { name: "Orion UltraBlock 1.25\"", type: "uhc" },
    
    // === ORION OTHER ===
    { name: "Orion SkyGlow 2\"", type: "light_pollution" },
    { name: "Orion SkyGlow 1.25\"", type: "light_pollution" },
    { name: "Orion Moon Filter 1.25\"", type: "moon" },
    { name: "Orion Variable Polarizing 1.25\"", type: "moon" },
    { name: "Orion Color Filter Set #1", type: "color" },
    { name: "Orion Color Filter Set #2", type: "color" },
    
    // === CELESTRON OIII ===
    { name: "Celestron OIII 2\"", type: "oiii" },
    { name: "Celestron OIII 1.25\"", type: "oiii" },
    
    // === CELESTRON UHC ===
    { name: "Celestron UHC/LPR 2\"", type: "uhc" },
    { name: "Celestron UHC/LPR 1.25\"", type: "uhc" },
    
    // === CELESTRON OTHER ===
    { name: "Celestron Moon Filter 1.25\"", type: "moon" },
    { name: "Celestron Variable Polarizer 1.25\"", type: "moon" },
    { name: "Celestron #94119-A Color Filter Set", type: "color" },
    
    // === EXPLORE SCIENTIFIC ===
    { name: "Explore Scientific OIII 2\"", type: "oiii" },
    { name: "Explore Scientific OIII 1.25\"", type: "oiii" },
    { name: "Explore Scientific UHC 2\"", type: "uhc" },
    { name: "Explore Scientific UHC 1.25\"", type: "uhc" },
    { name: "Explore Scientific H-Beta 2\"", type: "uhc" },
    
    // === SVBONY ===
    { name: "SVBony OIII 7nm 2\"", type: "oiii" },
    { name: "SVBony OIII 7nm 1.25\"", type: "oiii" },
    { name: "SVBony UHC 2\"", type: "uhc" },
    { name: "SVBony UHC 1.25\"", type: "uhc" },
    { name: "SVBony H-alpha 7nm 2\"", type: "h_alpha" },
    { name: "SVBony CLS 2\"", type: "light_pollution" },
    { name: "SVBony CLS 1.25\"", type: "light_pollution" },
    
    // === MOON FILTERS ===
    { name: "Meade ND96 Moon Filter 1.25\"", type: "moon" },
    { name: "Sky-Watcher Moon Filter 1.25\"", type: "moon" },
    
    // === COLOR FILTER SETS ===
    { name: "Meade Color Filter Set", type: "color" },
    { name: "Baader Color Filter Set", type: "color" },
    { name: "Lumicon Red Filter", type: "color" },
    { name: "Lumicon Blue Filter", type: "color" },
    { name: "Lumicon Green Filter", type: "color" },
    { name: "Lumicon Yellow Filter", type: "color" },
    { name: "Lumicon Orange Filter", type: "color" },
  ],
  
  cameras: [
    // Smartphones - Apple
    { name: "iPhone 17 Pro Max", type: "smartphone", sensorSize: "1/1.28 inch" },
    { name: "iPhone 17 Pro", type: "smartphone", sensorSize: "1 inch" },
    { name: "iPhone 16 Pro Max", type: "smartphone", sensorSize: "1/1.28 inch" },
    { name: "iPhone 16 Pro", type: "smartphone", sensorSize: "1 inch" },
    { name: "iPhone 15 Pro", type: "smartphone", sensorSize: "1 inch" },
    { name: "iPhone 15 Pro Max", type: "smartphone", sensorSize: "1.28 inch" },
    { name: "iPhone 14 Pro", type: "smartphone", sensorSize: "1 inch" },
    { name: "iPhone 14 Pro Max", type: "smartphone", sensorSize: "1.28 inch" },
    { name: "iPhone 13 Pro", type: "smartphone", sensorSize: "1 inch" },
    
    // Smartphones - Samsung
    { name: "Samsung Galaxy S24 Ultra", type: "smartphone", sensorSize: "200MP" },
    { name: "Samsung Galaxy S23 Ultra", type: "smartphone", sensorSize: "200MP" },
    
    // Smartphones - Google
    { name: "Google Pixel 8 Pro", type: "smartphone", sensorSize: "1/1.31 inch" },
    { name: "Google Pixel 8", type: "smartphone", sensorSize: "1/1.31 inch" },
    { name: "Google Pixel 7 Pro", type: "smartphone", sensorSize: "1 inch" },
    
    // ZWO Cameras - Deep Sky
    { name: "ZWO ASI2600MC Pro", type: "astrocam", sensorSize: "APS-C Color (IMX571)" },
    { name: "ZWO ASI2600MM Pro", type: "astrocam", sensorSize: "APS-C Mono (IMX571)" },
    { name: "ZWO ASI6200MC Pro", type: "astrocam", sensorSize: "Full Frame Color (IMX455)" },
    { name: "ZWO ASI6200MM Pro", type: "astrocam", sensorSize: "Full Frame Mono (IMX455)" },
    { name: "ZWO ASI533MC Pro", type: "astrocam", sensorSize: "1 inch Color (IMX533)" },
    { name: "ZWO ASI533MM Pro", type: "astrocam", sensorSize: "1 inch Mono (IMX533)" },
    { name: "ZWO ASI585MC Pro", type: "astrocam", sensorSize: "1/1.2 inch Color (IMX585)" },
    { name: "ZWO ASI294MC Pro", type: "astrocam", sensorSize: "4/3 inch Color (IMX294)" },
    { name: "ZWO ASI294MM Pro", type: "astrocam", sensorSize: "4/3 inch Mono (IMX294)" },
    // ZWO Cameras - Planetary
    { name: "ZWO ASI174MM", type: "astrocam", sensorSize: "1/1.2 inch Mono (IMX174)" },
    { name: "ZWO ASI678MC", type: "astrocam", sensorSize: "1/1.8 inch Color (IMX678)" },
    { name: "ZWO ASI662MC", type: "astrocam", sensorSize: "1/3 inch Color (IMX662)" },
    { name: "ZWO ASI224MC", type: "astrocam", sensorSize: "1/3 inch Color (IMX224)" },
    { name: "ZWO ASI120MM Mini", type: "astrocam", sensorSize: "1/3 inch Mono" },
    { name: "ZWO ASI462MC", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX462)" },
    
    // SVBony Cameras - Deep Sky
    { name: "SVBony SV605CC", type: "astrocam", sensorSize: "1 inch Color (IMX533)" },
    { name: "SVBony SV405CC", type: "astrocam", sensorSize: "4/3 inch Color (IMX294)" },
    // SVBony Cameras - Planetary
    { name: "SVBony SV205 Planetary Camera", type: "astrocam", sensorSize: "1/2.8 inch Color 8MP USB3.0" },
    { name: "SVBony SC715C", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX715)" },
    { name: "SVBony SV705C", type: "astrocam", sensorSize: "1/1.2 inch Color (IMX585)" },
    { name: "SVBony SV305", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX290)" },
    { name: "SVBony SV305M Pro", type: "astrocam", sensorSize: "1/2.8 inch Mono (IMX290)" },
    { name: "SVBony SC311", type: "astrocam", sensorSize: "1/3 inch WiFi (IMX662)" },
    
    // QHYCCD Cameras - Deep Sky
    { name: "QHY268M", type: "astrocam", sensorSize: "APS-C Mono (IMX571)" },
    { name: "QHY268C", type: "astrocam", sensorSize: "APS-C Color (IMX571)" },
    { name: "QHY600M", type: "astrocam", sensorSize: "Full Frame Mono (IMX455)" },
    { name: "QHY600C", type: "astrocam", sensorSize: "Full Frame Color (IMX455)" },
    { name: "QHY533M", type: "astrocam", sensorSize: "1 inch Mono (IMX533)" },
    { name: "QHY533C", type: "astrocam", sensorSize: "1 inch Color (IMX533)" },
    { name: "QHY294M Pro", type: "astrocam", sensorSize: "4/3 inch Mono" },
    { name: "QHY294C Pro", type: "astrocam", sensorSize: "4/3 inch Color" },
    { name: "QHY183M", type: "astrocam", sensorSize: "1 inch Mono (IMX183)" },
    { name: "QHY183C", type: "astrocam", sensorSize: "1 inch Color (IMX183)" },
    { name: "QHY461", type: "astrocam", sensorSize: "Medium Format 100MP (IMX461)" },
    { name: "QHY411", type: "astrocam", sensorSize: "Medium Format 150MP (IMX411)" },
    // QHYCCD Cameras - Planetary/Guiding
    { name: "QHY5III462C", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX462)" },
    { name: "QHY5III462M", type: "astrocam", sensorSize: "1/2.8 inch Mono (IMX462)" },
    { name: "QHY5III568M", type: "astrocam", sensorSize: "1/2 inch Mono (IMX568)" },
    { name: "QHY5III678C", type: "astrocam", sensorSize: "1/1.8 inch Color (IMX678)" },
    { name: "QHY5III485C", type: "astrocam", sensorSize: "1/1.2 inch Color (IMX485)" },
    { name: "QHY5III178M", type: "astrocam", sensorSize: "1/1.8 inch Mono (IMX178)" },
    { name: "QHY5III178C", type: "astrocam", sensorSize: "1/1.8 inch Color (IMX178)" },
    
    // Atik Cameras
    { name: "Atik Horizon II Mono", type: "astrocam", sensorSize: "4/3 inch Mono (MN34230)" },
    { name: "Atik Horizon II Color", type: "astrocam", sensorSize: "4/3 inch Color (MN34230)" },
    { name: "Atik ACIS 7.1", type: "astrocam", sensorSize: "1 inch (IMX428)" },
    { name: "Atik ACIS 12.3", type: "astrocam", sensorSize: "4/3 inch 12MP" },
    { name: "Atik Infinity Mono", type: "astrocam", sensorSize: "1/2 inch Mono (ICX825)" },
    { name: "Atik Infinity Color", type: "astrocam", sensorSize: "1/2 inch Color (ICX825)" },
    
    // Starlight Xpress Cameras
    { name: "Starlight Xpress Trius Pro 694", type: "astrocam", sensorSize: "1 inch Mono CCD (ICX694)" },
    { name: "Starlight Xpress Trius Pro 674", type: "astrocam", sensorSize: "1/2 inch Mono CCD (ICX674)" },
    { name: "Starlight Xpress Trius Pro 814", type: "astrocam", sensorSize: "2/3 inch Mono CCD (ICX814)" },
    { name: "Starlight Xpress Trius Pro 834", type: "astrocam", sensorSize: "APS-C Mono CCD (ICX834)" },
    { name: "Starlight Xpress Lodestar X2", type: "astrocam", sensorSize: "1/3 inch Mono CCD" },
    { name: "Starlight Xpress Lodestar Pro", type: "astrocam", sensorSize: "1/3 inch Mono CCD (ICX829)" },
    { name: "Starlight Xpress SX-25C", type: "astrocam", sensorSize: "APS-C Color CCD" },
    { name: "Starlight Xpress SX-35", type: "astrocam", sensorSize: "APS-C Mono CCD 11MP" },
    
    // DSLRs/Mirrorless - Canon
    { name: "Canon EOS Ra", type: "dslr", sensorSize: "Full Frame" },
    { name: "Canon EOS R5", type: "dslr", sensorSize: "Full Frame" },
    { name: "Canon EOS R6 Mark II", type: "dslr", sensorSize: "Full Frame" },
    { name: "Canon EOS 6D Mark II", type: "dslr", sensorSize: "Full Frame" },
    { name: "Canon EOS 5D Mark IV", type: "dslr", sensorSize: "Full Frame" },
    { name: "Canon T7i / 800D", type: "dslr", sensorSize: "APS-C" },
    { name: "Canon T8i / 850D", type: "dslr", sensorSize: "APS-C" },
    
    // DSLRs/Mirrorless - Nikon
    { name: "Nikon Z5", type: "dslr", sensorSize: "Full Frame" },
    { name: "Nikon Z6 III", type: "dslr", sensorSize: "Full Frame" },
    { name: "Nikon Z6 II", type: "dslr", sensorSize: "Full Frame" },
    { name: "Nikon D850", type: "dslr", sensorSize: "Full Frame" },
    { name: "Nikon D7500", type: "dslr", sensorSize: "APS-C" },
    
    // DSLRs/Mirrorless - Sony
    { name: "Sony A7 IV", type: "dslr", sensorSize: "Full Frame" },
    { name: "Sony A7C II", type: "dslr", sensorSize: "Full Frame" },
    { name: "Sony A7R IV", type: "dslr", sensorSize: "Full Frame" },
    { name: "Sony A7S III", type: "dslr", sensorSize: "Full Frame" },
    { name: "Sony A6700", type: "dslr", sensorSize: "APS-C" },
    { name: "Sony A6600", type: "dslr", sensorSize: "APS-C" },
  ],
  
  modifiers: [
    // === STARIZONA - Premium SCT & Newtonian ===
    { name: "Starizona Night Owl 0.4x", type: "focal_reducer", factor: 0.4, notes: "Ultra-fast imaging, f/2 capable" },
    { name: "Starizona SCT Corrector IV", type: "focal_reducer", factor: 0.63, notes: "Premium SCT reducer with coma correction" },
    { name: "Starizona SCT Corrector LF 0.7x", type: "focal_reducer", factor: 0.7, notes: "Large format, full-frame sensors" },
    { name: "Starizona Nexus 0.75x", type: "focal_reducer", factor: 0.75, notes: "Premium Newtonian reducer, f/4 to f/3" },
    { name: "Starizona Hyperstar 8\" SCT", type: "focal_reducer", factor: 0.24, notes: "Ultra-fast f/2, replaces secondary" },
    { name: "Starizona Hyperstar 11\" SCT", type: "focal_reducer", factor: 0.22, notes: "Ultra-fast f/2, replaces secondary" },
    { name: "Starizona Hyperstar 14\" SCT", type: "focal_reducer", factor: 0.20, notes: "Ultra-fast f/2, replaces secondary" },
    
    // === CELESTRON SCT REDUCERS ===
    { name: "Celestron f/6.3 Reducer", type: "focal_reducer", factor: 0.63, notes: "Standard SCT reducer, 105mm backfocus" },
    { name: "Celestron EdgeHD 0.7x Reducer 8\"", type: "focal_reducer", factor: 0.7, notes: "For EdgeHD 800" },
    { name: "Celestron EdgeHD 0.7x Reducer 9.25\"", type: "focal_reducer", factor: 0.7, notes: "For EdgeHD 925" },
    { name: "Celestron EdgeHD 0.7x Reducer 11\"", type: "focal_reducer", factor: 0.7, notes: "For EdgeHD 1100" },
    { name: "Celestron EdgeHD 0.7x Reducer 14\"", type: "focal_reducer", factor: 0.7, notes: "For EdgeHD 1400" },
    
    // === MEADE SCT REDUCERS ===
    { name: "Meade f/6.3 Reducer", type: "focal_reducer", factor: 0.63, notes: "Standard SCT reducer" },
    { name: "Meade f/3.3 Reducer", type: "focal_reducer", factor: 0.33, notes: "Fast SCT reducer" },
    
    // === TELEVUE COMA CORRECTORS ===
    { name: "TeleVue Paracorr Type 2", type: "coma_corrector", factor: 1.15, notes: "Premium visual/imaging corrector" },
    { name: "TeleVue Big Paracorr Type 2", type: "coma_corrector", factor: 1.15, notes: "For large Newtonians, 2\" barrel" },
    { name: "TeleVue Paracorr QL Type 2", type: "coma_corrector", factor: 1.00, notes: "Quick-lock version" },
    
    // === BAADER COMA CORRECTORS ===
    { name: "Baader MPCC Mark III", type: "coma_corrector", factor: 1.0, notes: "Classic coma corrector, no magnification change" },
    { name: "Baader MPCC Mark III Slim", type: "coma_corrector", factor: 1.0, notes: "Short profile version" },
    { name: "Baader RCC-I Rowe Corrector", type: "coma_corrector", factor: 1.0, notes: "Advanced coma corrector, f/3-f/6" },
    { name: "Baader RCC-I Rowe Corrector M68", type: "coma_corrector", factor: 1.0, notes: "M68 threaded version" },
    
    // === EXPLORE SCIENTIFIC ===
    { name: "Explore Scientific HR Coma Corrector", type: "coma_corrector", factor: 1.06, notes: "Visual and imaging, f/3 capable" },
    { name: "Explore Scientific 0.7x Reducer", type: "focal_reducer", factor: 0.7, notes: "For ED-APO refractors 127mm+" },
    { name: "Explore Scientific 0.8x Reducer", type: "focal_reducer", factor: 0.8, notes: "For ED-APO refractors" },
    
    // === WILLIAM OPTICS REDUCERS/FLATTENERS ===
    { name: "William Optics Flat68 III 1x", type: "coma_corrector", factor: 1.0, notes: "Field flattener for refractors" },
    { name: "William Optics Flat6A III 0.8x", type: "focal_reducer", factor: 0.8, notes: "Reducer/flattener, 44mm image circle" },
    { name: "William Optics Flat7A 0.72x", type: "focal_reducer", factor: 0.72, notes: "Fast reducer for imaging" },
    { name: "William Optics Flat61R 0.80x", type: "focal_reducer", factor: 0.8, notes: "For Z61 series" },
    { name: "William Optics Flat73R 0.80x", type: "focal_reducer", factor: 0.8, notes: "For Z73 series" },
    { name: "William Optics Flat8 III 1x", type: "coma_corrector", factor: 1.0, notes: "Premium flattener, full-frame" },
    
    // === SKY-WATCHER ===
    { name: "Sky-Watcher Coma Corrector (S20200)", type: "coma_corrector", factor: 1.0, notes: "Standard Newtonian corrector" },
    { name: "Sky-Watcher 0.85x Focal Reducer", type: "focal_reducer", factor: 0.85, notes: "For Esprit refractors" },
    { name: "Sky-Watcher Flattener/Reducer 0.72x", type: "focal_reducer", factor: 0.72, notes: "For Esprit series" },
    
    // === SHARPSTAR / TSINGHUA ===
    { name: "Sharpstar 0.95x MPCC", type: "coma_corrector", factor: 0.95, notes: "Reducing coma corrector for Newtonians" },
    { name: "Sharpstar 3\" Full Frame Corrector", type: "coma_corrector", factor: 1.0, notes: "For large Newtonians" },
    { name: "Sharpstar 0.8x Reducer/Flattener", type: "focal_reducer", factor: 0.8, notes: "For refractors, 44mm image circle" },
    
    // === TS OPTICS ===
    { name: "TS 0.95x Maxfield Corrector", type: "coma_corrector", factor: 0.95, notes: "Budget Newtonian corrector" },
    { name: "TS 0.79x Reducer/Corrector", type: "focal_reducer", factor: 0.79, notes: "For refractors" },
    { name: "TS GPU Multi-Flattener", type: "coma_corrector", factor: 1.0, notes: "Universal field flattener" },
    
    // === GSO / BUDGET OPTIONS ===
    { name: "GSO 0.75x Reducer", type: "focal_reducer", factor: 0.75, notes: "Budget Newtonian reducer" },
    { name: "GSO Coma Corrector", type: "coma_corrector", factor: 1.1, notes: "Budget coma corrector" },
    { name: "GSO 2\" Coma Corrector", type: "coma_corrector", factor: 1.0, notes: "For larger Newtonians" },
    
    // === ASKAR ===
    { name: "Askar 0.8x Full Frame Reducer", type: "focal_reducer", factor: 0.8, notes: "For Askar refractors" },
    { name: "Askar 0.76x Reducer/Flattener", type: "focal_reducer", factor: 0.76, notes: "For Askar 103APO" },
    { name: "Askar Field Flattener 1.0x", type: "coma_corrector", factor: 1.0, notes: "For Askar doublet APOs" },
    
    // === TAKAHASHI ===
    { name: "Takahashi TOA-35 Reducer 0.7x", type: "focal_reducer", factor: 0.7, notes: "Premium Takahashi reducer" },
    { name: "Takahashi QE 0.73x Reducer", type: "focal_reducer", factor: 0.73, notes: "For FSQ series" },
    { name: "Takahashi Corrector Q 0.73x", type: "focal_reducer", factor: 0.73, notes: "For FSQ-85 and FSQ-106" },
    { name: "Takahashi Flattener for FC/FS", type: "coma_corrector", factor: 1.0, notes: "For FC and FS series" },
    
    // === ORION ===
    { name: "Orion 0.85x Reducer/Corrector", type: "focal_reducer", factor: 0.85, notes: "For ED refractors" },
    { name: "Orion Field Flattener for EON", type: "coma_corrector", factor: 1.0, notes: "For EON refractors" },
    
    // === ZWO ===
    { name: "ZWO ASI Field Flattener", type: "coma_corrector", factor: 1.0, notes: "For ZWO imaging trains" },
    { name: "ZWO FF65 Reducer/Flattener", type: "focal_reducer", factor: 0.85, notes: "For small refractors" },
    
    // === APM / LZOS ===
    { name: "APM 0.7x Reducer", type: "focal_reducer", factor: 0.7, notes: "For APM refractors" },
    { name: "APM Riccardi Reducer 0.75x", type: "focal_reducer", factor: 0.75, notes: "Premium design" },
    { name: "Riccardi 0.75x Reducer", type: "focal_reducer", factor: 0.75, notes: "Universal premium reducer" },
    
    // === OPTOLONG ===
    { name: "Optolong L-Ultimate 2in1 Reducer 0.80x", type: "focal_reducer", factor: 0.8, notes: "Combined reducer/filter holder" },
    
    // === APERTURA ===
    { name: "Apertura PRCC 0.95x", type: "coma_corrector", factor: 0.95, notes: "For CarbonStar 150, reducing" },
  ],
};

interface EquipmentSearchProps {
  category: "telescopes" | "eyepieces" | "barlows" | "filters" | "cameras" | "modifiers";
  onSelect: (equipment: any) => void;
}

// Shared list content component
function EquipmentList({ 
  items, 
  filtered, 
  category, 
  onSelect 
}: { 
  items: any[];
  filtered: any[]; 
  category: string; 
  onSelect: (item: any) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 text-center">No equipment found</div>
      ) : (
        <div className="space-y-1 p-2">
          {filtered.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(item)}
              className="w-full text-left px-3 py-3 rounded-md hover:bg-muted hover-elevate text-sm border-b last:border-0"
              data-testid={`item-select-${category}-${idx}`}
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {category === "telescopes"
                  ? (item.aperture && item.focalLength 
                      ? `${item.aperture}mm f/${(item.focalLength / item.aperture).toFixed(1)}`
                      : `${item.type || "Telescope"}`)
                  : category === "eyepieces"
                  ? `${item.focalLength}mm, ${item.apparentFov}°`
                  : category === "barlows"
                  ? `${item.factor}x`
                  : category === "filters"
                  ? item.type
                  : category === "modifiers"
                  ? `${item.factor}× ${item.type === "focal_reducer" ? "Reducer" : "Corrector"}${item.notes ? ` - ${item.notes}` : ""}`
                  : item.sensorSize}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EquipmentSearch({ category, onSelect }: EquipmentSearchProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const items = equipmentDatabases[category] || [];
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    if (!search) return items;
    const query = search.toLowerCase();
    return items.filter(item => item.name.toLowerCase().includes(query));
  }, [search, items]);

  const handleSelect = (item: any) => {
    onSelect(item);
    setSheetOpen(false);
    setSearch("");
  };

  const categoryLabels: Record<string, string> = {
    telescopes: "Telescope",
    eyepieces: "Eyepiece", 
    barlows: "Barlow Lens",
    filters: "Filter",
    cameras: "Camera",
    modifiers: "Optical Modifier"
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start text-left font-normal"
        onClick={() => setSheetOpen(true)}
        data-testid={`button-search-${category}`}
      >
        🔍 Search {items.length} options...
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[80vh] flex flex-col p-0"
        >
          <SheetHeader className="p-4 pb-2 border-b">
            <SheetTitle>Select {categoryLabels[category]}</SheetTitle>
            <SheetDescription>
              Browse {items.length} options or search below
            </SheetDescription>
            <Input
              placeholder={`Search ${category}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-2"
              data-testid={`input-search-${category}`}
              autoFocus
            />
            <div className="text-xs text-muted-foreground mt-1">
              Showing {filtered.length} of {items.length}
            </div>
          </SheetHeader>
          
          <EquipmentList 
            items={items}
            filtered={filtered}
            category={category}
            onSelect={handleSelect}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
