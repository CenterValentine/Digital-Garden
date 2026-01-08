import type { ResumeData, PDFExportOptions } from "./types";
import { formatDateRange, formatDate } from "./date-utils";
import { formatLocation } from "@/components/client/resume/utils";
import { getCanonicalSkillName } from "./skills-utils";

export function generatePDFHTML(
  resumeData: ResumeData,
  options: PDFExportOptions
): string {
  const { personalInfo, summary, experience, skills, projects, education, certifications, awards, languages } = resumeData;

  let html = `
    <div class="header">
      <h1>${escapeHtml(personalInfo.name)}</h1>
      <p>${escapeHtml(personalInfo.headline)}</p>
      <div class="contact-info">
        ${personalInfo.location ? `<span>${escapeHtml(formatLocation(personalInfo.location))}</span>` : ""}
        <span>${escapeHtml(personalInfo.email)}</span>
        ${options.includePhone && personalInfo.phone ? `<span>${escapeHtml(personalInfo.phone)}</span>` : ""}
        ${personalInfo.links?.map(link => `<span>${escapeHtml(link.label)}: ${escapeHtml(link.url)}</span>`).join("") || ""}
      </div>
    </div>
  `;

  // Summary
  if (summary) {
    html += `
      <div class="section">
        <h2>Summary</h2>
        ${summary.paragraphs?.map(p => `<p>${escapeHtml(p)}</p>`).join("") || ""}
        ${summary.highlights && summary.highlights.length > 0 ? `
          <ul>
            ${summary.highlights.map(h => `<li>${escapeHtml(h.text)}</li>`).join("")}
          </ul>
        ` : ""}
      </div>
    `;
  }

  // Experience
  if (experience && experience.length > 0) {
    html += `
      <div class="section">
        <h2>Experience</h2>
        ${experience.map(exp => `
          <div class="experience-item">
            <div class="experience-header">
              <div>
                <div class="experience-title">${escapeHtml(exp.position)}</div>
                <div class="experience-company">${escapeHtml(exp.company)}</div>
              </div>
              <div class="experience-date">${formatDateRange(exp.dateRange)}</div>
            </div>
            ${exp.location || exp.employmentType || exp.teamOrOrg ? `
              <div class="experience-meta">
                ${exp.location ? formatLocation(exp.location) : ""}
                ${exp.employmentType ? ` • ${exp.employmentType}` : ""}
                ${exp.teamOrOrg ? ` • ${exp.teamOrOrg}` : ""}
              </div>
            ` : ""}
            ${exp.bullets && exp.bullets.length > 0 ? `
              <ul>
                ${exp.bullets.map(bullet => `<li>${escapeHtml(bullet.text)}</li>`).join("")}
              </ul>
            ` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  // Skills
  if (skills && skills.items && skills.items.length > 0) {
    html += `
      <div class="section">
        <h2>Skills</h2>
        <div class="skills-grid">
          ${skills.items.map(skill => `
            <span class="skill-item">${escapeHtml(skill.name)}</span>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Projects
  if (projects && projects.length > 0) {
    html += `
      <div class="section">
        <h2>Projects</h2>
        ${projects.map(project => `
          <div class="project-item">
            <div class="project-header">
              <div>
                <div class="project-title">${escapeHtml(project.name)}</div>
                ${project.role ? `<div class="project-role">${escapeHtml(project.role)}</div>` : ""}
              </div>
              ${project.dateRange ? `<div class="project-date">${formatDateRange(project.dateRange)}</div>` : ""}
            </div>
            ${project.bullets && project.bullets.length > 0 ? `
              <ul>
                ${project.bullets.map(bullet => `<li>${escapeHtml(bullet.text)}</li>`).join("")}
              </ul>
            ` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  // Education
  if (education && education.length > 0) {
    html += `
      <div class="section">
        <h2>Education</h2>
        ${education.map(edu => `
          <div class="education-item">
            <div class="education-header">
              <div>
                <div class="education-title">${escapeHtml(edu.institution)}</div>
                <div class="education-institution">
                  ${escapeHtml(edu.degree)}${edu.field ? ` in ${escapeHtml(edu.field)}` : ""}
                </div>
              </div>
              ${edu.dateRange ? `<div class="education-date">${formatDateRange(edu.dateRange)}</div>` : ""}
            </div>
            ${edu.gpa ? `<p>GPA: ${escapeHtml(edu.gpa)}</p>` : ""}
            ${edu.honors && edu.honors.length > 0 ? `<p>${edu.honors.join(", ")}</p>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  // Certifications & Awards (combined)
  if (
    (certifications && certifications.length > 0) ||
    (awards && awards.length > 0)
  ) {
    html += `
      <div class="section">
        <h2>Certifications & Awards</h2>
        ${certifications && certifications.length > 0
        ? certifications
            .map(
              (cert) => `
          <div class="certification-item">
            <div class="certification-name">${escapeHtml(cert.name)}</div>
            <div class="certification-meta">
              ${escapeHtml(cert.issuer)} • ${formatDate(cert.date)}
              ${cert.expiryDate ? ` • Expires: ${formatDate(cert.expiryDate)}` : ""}
              ${cert.credentialId ? ` • ID: ${escapeHtml(cert.credentialId)}` : ""}
            </div>
          </div>
        `
            )
            .join("")
        : ""}
        ${awards && awards.length > 0
        ? awards
            .map(
              (award) => `
          <div class="award-item">
            <div class="award-title">${escapeHtml(award.title)}</div>
            <div class="award-meta">
              ${award.issuer ? `${escapeHtml(award.issuer)} • ` : ""}
              ${award.date ? formatDate(award.date) : ""}
            </div>
            ${award.description ? `<p>${escapeHtml(award.description)}</p>` : ""}
          </div>
        `
            )
            .join("")
        : ""}
      </div>
    `;
  }

  // Languages
  if (languages && languages.length > 0) {
    html += `
      <div class="section">
        <h2>Languages</h2>
        <div>
          ${languages.map(lang => `
            <span class="language-item">${escapeHtml(lang.language)} - ${escapeHtml(lang.proficiency)}</span>
          `).join("")}
        </div>
      </div>
    `;
  }

  return html;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

