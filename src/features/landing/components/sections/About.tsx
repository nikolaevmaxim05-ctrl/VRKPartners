"use client";

import * as React from "react";
import Image from "next/image";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { hasText } from "@core/domain/content/messages";
import type { AboutMember } from "@core/domain/content/site-messages";
import { nbHyphen } from "@/shared/lib/nb-hyphen";

type Labels = { experienceLabel: string; roleLabel: string; skillsLabel: string };

/** Картка учасника з 3D-нахилом услід за курсором. */
function MemberCard({ m, labels }: { m: AboutMember; labels: Labels }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState({ rx: 0, ry: 0, active: false });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    const MAX = 3.5; // максимальний кут нахилу, градуси
    setTilt({ rx: -py * 2 * MAX, ry: px * 2 * MAX, active: true });
  };
  const handleLeave = () => setTilt({ rx: 0, ry: 0, active: false });

  return (
    <div style={{ perspective: "900px" }}>
      <article
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.active ? 1.02 : 1})`,
          transition: tilt.active ? "transform 80ms ease-out" : "transform 300ms ease-out",
        }}
        className="flex flex-col items-center rounded-2xl border border-bg-line bg-bg-card p-6 text-center shadow-card [transform-style:preserve-3d] will-change-transform sm:p-8"
      >
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 sm:h-48 sm:w-48">
          {m.photo ? (
            <Image
              src={m.photo}
              alt={m.name}
              width={224}
              height={224}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-bg-soft" />
          )}
        </div>

        <h3 className="mt-4 text-lg font-bold text-white">{m.name}</h3>

        <dl className="mt-4 space-y-2 text-left text-sm leading-relaxed">
          {hasText(m.experience) && (
            <p>
              <span className="font-semibold text-brand">{labels.experienceLabel} </span>
              <span className="text-white/70">{m.experience}</span>
            </p>
          )}
          {hasText(m.role) && (
            <p>
              <span className="font-semibold text-brand">{labels.roleLabel} </span>
              <span className="text-white/70">{m.role}</span>
            </p>
          )}
          {hasText(m.skills) && (
            <p>
              <span className="font-semibold text-brand">{labels.skillsLabel} </span>
              <span className="text-white/70">{m.skills}</span>
            </p>
          )}
        </dl>
      </article>
    </div>
  );
}

export function About({ titleAs: Title = "h2" }: { titleAs?: "h1" | "h2" } = {}) {
  const { about } = useSiteMessages();
  const members = about.members.filter((m) => hasText(m.name));
  const labels = { experienceLabel: about.experienceLabel, roleLabel: about.roleLabel, skillsLabel: about.skillsLabel };

  return (
    <section id="about" className="section">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          {hasText(about.eyebrow) && (
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              {about.eyebrow}
            </p>
          )}
          <Title data-fit className="h2 mt-3">{nbHyphen(about.title)}</Title>
          {hasText(about.text) && (
            <p className="mt-4 text-lg text-white/60">{about.text}</p>
          )}
        </div>

        <div data-items={members.length} className="reveal-stagger mt-10 grid gap-5 sm:grid-cols-2">
          {members.map((m, i) => (
            <MemberCard key={i} m={m} labels={labels} />
          ))}
        </div>
      </div>
    </section>
  );
}
