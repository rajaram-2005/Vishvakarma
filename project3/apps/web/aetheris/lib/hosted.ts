/**
 * Hosted/Vercel mode flag. On a serverless host there is no shared disk (only an ephemeral /tmp),
 * no docker daemon, and no long-lived process — subsystems read this to pick honest degraded
 * behaviour (fast-fail docker, ephemeral deploy dirs, …) instead of failing obscurely.
 * Local, Docker and desktop are unaffected: everything stays as before unless AETHERIS_HOSTED=1.
 */
export const hostedMode = () => process.env.AETHERIS_HOSTED === "1";
