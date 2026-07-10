"use client";

import * as React from "react";
import Image from "next/image";
import { useContent } from "@/components/ContentProvider";

type Member = {
  key: string;
  name: string;
  photo: string;
  experience: string;
  role: string;
  skills: string;
};

/** Картка учасника з 3D-нахилом услід за курсором. */
function MemberCard({ m }: { m: Member }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState({ rx: 0, ry: 0, active: false });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    const MAX = 7; // максимальний кут нахилу, градуси
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
        className="flex flex-col items-center rounded-2xl border border-bg-line bg-bg-card p-6 text-center shadow-card [transform-style:preserve-3d] will-change-transform hover:border-brand/40 sm:p-8"
      >
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-full ring-2 ring-brand/40 sm:h-48 sm:w-48">
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
          {m.experience && (
            <p>
              <span className="font-semibold text-brand">
                Досвід PPC Google Ads:{" "}
              </span>
              <span className="text-white/70">{m.experience}</span>
            </p>
          )}
          {m.role && (
            <p>
              <span className="font-semibold text-brand">Роль: </span>
              <span className="text-white/70">{m.role}</span>
            </p>
          )}
          {m.skills && (
            <p>
              <span className="font-semibold text-brand">Навички: </span>
              <span className="text-white/70">{m.skills}</span>
            </p>
          )}
        </dl>
      </article>
    </div>
  );
}

export function About() {
  const { about } = useContent();

  return (
    <section id="about" className="section bg-bg-soft/40">
      <div className="container-x">
        <div className="reveal max-w-3xl">
          {about.eyebrow && (
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">
              {about.eyebrow}
            </p>
          )}
          <h2 className="h2 mt-3">{about.title}</h2>
          {about.text && (
            <p className="mt-4 text-lg text-white/60">{about.text}</p>
          )}
        </div>

        <div className="reveal-stagger mt-10 grid gap-5 sm:grid-cols-2">
          {about.members.map((m) => (
            <MemberCard key={m.key} m={m} />
          ))}
        </div>
      </div>
    </section>
  );
}
