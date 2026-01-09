import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

let fontCache: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  
  const response = await fetch(
    "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
  );
  fontCache = await response.arrayBuffer();
  return fontCache;
}

interface AchievementShareData {
  username: string;
  level: number;
  title: string;
  totalXP: number;
  badgeCount: number;
  messierCount: number;
  totalObservations: number;
  highlightedBadges: Array<{
    name: string;
    tier: string;
  }>;
  proudStats: string[];
}

const tierGradients: Record<string, { from: string; to: string }> = {
  special: { from: "#8B5CF6", to: "#EC4899" },
  gold: { from: "#F59E0B", to: "#D97706" },
  silver: { from: "#94A3B8", to: "#64748B" },
  bronze: { from: "#B45309", to: "#92400E" },
};

function getLevelColor(level: number): string {
  if (level >= 15) return "#F59E0B";
  if (level >= 10) return "#8B5CF6";
  if (level >= 5) return "#3B82F6";
  return "#6366F1";
}

export async function generateAchievementShareImage(
  data: AchievementShareData,
  format: "landscape" | "square" = "landscape"
): Promise<Buffer> {
  const width = format === "landscape" ? 1200 : 1080;
  const height = format === "landscape" ? 630 : 1080;
  
  const levelColor = getLevelColor(data.level);
  const isLandscape = format === "landscape";
  
  const badgeElements = data.highlightedBadges.slice(0, 3).map((badge, idx) => {
    const gradient = tierGradients[badge.tier] || tierGradients.bronze;
    return {
      type: "div" as const,
      key: `badge-${idx}`,
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          borderRadius: "20px",
          background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
          color: "white",
          fontSize: "16px",
          fontWeight: 600,
        },
        children: badge.name,
      },
    };
  });

  const statElements = data.proudStats
    .filter(stat => stat && stat.length > 0)
    .slice(0, 2)
    .map((stat, idx) => ({
      type: "div" as const,
      key: `stat-${idx}`,
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          background: "rgba(99, 102, 241, 0.2)",
          borderRadius: "8px",
          color: "#C7D2FE",
          fontSize: "14px",
        },
        children: stat,
      },
    }));

  const element = {
    type: "div" as const,
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column" as const,
        background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #312E81 100%)",
        padding: isLandscape ? "40px" : "56px",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div" as const,
          key: "header",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              marginBottom: isLandscape ? "24px" : "40px",
            },
            children: [
              {
                type: "div" as const,
                key: "level-circle",
                props: {
                  style: {
                    width: isLandscape ? "72px" : "88px",
                    height: isLandscape ? "72px" : "88px",
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${levelColor}, ${levelColor}88)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: isLandscape ? "32px" : "40px",
                    fontWeight: 700,
                    color: "white",
                    marginRight: "20px",
                  },
                  children: String(data.level),
                },
              },
              {
                type: "div" as const,
                key: "title-section",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column" as const,
                  },
                  children: [
                    {
                      type: "div" as const,
                      key: "title",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: isLandscape ? "32px" : "40px",
                          fontWeight: 700,
                          color: "white",
                        },
                        children: data.title,
                      },
                    },
                    {
                      type: "div" as const,
                      key: "xp",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: isLandscape ? "16px" : "20px",
                          color: "#A5B4FC",
                          marginTop: "4px",
                        },
                        children: `${data.totalXP.toLocaleString()} XP earned`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "div" as const,
          key: "stats-row",
          props: {
            style: {
              display: "flex",
              marginBottom: isLandscape ? "24px" : "40px",
            },
            children: [
              {
                type: "div" as const,
                key: "badges-stat",
                props: {
                  style: {
                    flex: 1,
                    background: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "16px",
                    padding: isLandscape ? "20px" : "28px",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    marginRight: "16px",
                  },
                  children: [
                    {
                      type: "div" as const,
                      key: "badge-count",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: isLandscape ? "32px" : "40px",
                          fontWeight: 700,
                          color: "white",
                        },
                        children: String(data.badgeCount),
                      },
                    },
                    {
                      type: "div" as const,
                      key: "badge-label",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: "14px",
                          color: "#A5B4FC",
                          marginTop: "4px",
                        },
                        children: "Badges",
                      },
                    },
                  ],
                },
              },
              {
                type: "div" as const,
                key: "messier-stat",
                props: {
                  style: {
                    flex: 1,
                    background: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "16px",
                    padding: isLandscape ? "20px" : "28px",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    marginRight: "16px",
                  },
                  children: [
                    {
                      type: "div" as const,
                      key: "messier-count",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: isLandscape ? "32px" : "40px",
                          fontWeight: 700,
                          color: "white",
                        },
                        children: `${data.messierCount}/110`,
                      },
                    },
                    {
                      type: "div" as const,
                      key: "messier-label",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: "14px",
                          color: "#A5B4FC",
                          marginTop: "4px",
                        },
                        children: "Messier",
                      },
                    },
                  ],
                },
              },
              {
                type: "div" as const,
                key: "obs-stat",
                props: {
                  style: {
                    flex: 1,
                    background: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "16px",
                    padding: isLandscape ? "20px" : "28px",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                  },
                  children: [
                    {
                      type: "div" as const,
                      key: "obs-count",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: isLandscape ? "32px" : "40px",
                          fontWeight: 700,
                          color: "white",
                        },
                        children: String(data.totalObservations),
                      },
                    },
                    {
                      type: "div" as const,
                      key: "obs-label",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: "14px",
                          color: "#A5B4FC",
                          marginTop: "4px",
                        },
                        children: "Observations",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        ...(badgeElements.length > 0 ? [{
          type: "div" as const,
          key: "featured-section",
          props: {
            style: {
              display: "flex",
              flexDirection: "column" as const,
              marginBottom: isLandscape ? "20px" : "32px",
            },
            children: [
              {
                type: "div" as const,
                key: "featured-label",
                props: {
                  style: {
                    display: "flex",
                    fontSize: "12px",
                    color: "#A5B4FC",
                    marginBottom: "10px",
                    textTransform: "uppercase" as const,
                    letterSpacing: "1px",
                  },
                  children: "Featured Achievements",
                },
              },
              {
                type: "div" as const,
                key: "badges-container",
                props: {
                  style: {
                    display: "flex",
                    flexWrap: "wrap" as const,
                  },
                  children: badgeElements.map((el, i) => ({
                    ...el,
                    props: {
                      ...el.props,
                      style: {
                        ...el.props.style,
                        marginRight: i < badgeElements.length - 1 ? "10px" : "0",
                      },
                    },
                  })),
                },
              },
            ],
          },
        }] : []),
        ...(statElements.length > 0 ? [{
          type: "div" as const,
          key: "proud-stats",
          props: {
            style: {
              display: "flex",
              flexWrap: "wrap" as const,
            },
            children: statElements.map((el, i) => ({
              ...el,
              props: {
                ...el.props,
                style: {
                  ...el.props.style,
                  marginRight: i < statElements.length - 1 ? "10px" : "0",
                },
              },
            })),
          },
        }] : []),
        {
          type: "div" as const,
          key: "footer",
          props: {
            style: {
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "20px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            },
            children: [
              {
                type: "div" as const,
                key: "brand",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                  },
                  children: [
                    {
                      type: "div" as const,
                      key: "telescope-icon",
                      props: {
                        style: {
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontSize: "16px",
                          fontWeight: 700,
                          marginRight: "12px",
                        },
                        children: "AP",
                      },
                    },
                    {
                      type: "div" as const,
                      key: "brand-text",
                      props: {
                        style: {
                          display: "flex",
                          flexDirection: "column" as const,
                        },
                        children: [
                          {
                            type: "div" as const,
                            key: "brand-name",
                            props: {
                              style: {
                                display: "flex",
                                fontSize: "20px",
                                fontWeight: 700,
                                color: "white",
                              },
                              children: "AstroPilot",
                            },
                          },
                          {
                            type: "div" as const,
                            key: "brand-tagline",
                            props: {
                              style: {
                                display: "flex",
                                fontSize: "12px",
                                color: "#A5B4FC",
                              },
                              children: "Plan - Observe - Discover",
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              {
                type: "div" as const,
                key: "cta",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 20px",
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    borderRadius: "10px",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: 600,
                  },
                  children: "Start Your Journey",
                },
              },
            ],
          },
        },
      ],
    },
  };

  const fontData = await loadFont();
  
  const svg = await satori(element as any, {
    width,
    height,
    fonts: [
      {
        name: "Inter",
        data: fontData,
        weight: 400,
        style: "normal" as const,
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: width,
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}
