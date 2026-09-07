import { openUrl } from "@tauri-apps/plugin-opener";
import * as React from "react";
import type { AppSettings } from "../../../bindings/overlay";
import type { JsonValue } from "../types";
import styles from "../configStyles";
import type { LanguageManager } from "../../i18n/languageManager";

type TabGroup = {
    title: string;
    paths?: string[][];
    links?: [string, string][];
    placeholder?: string;
};

type ConfigTab = {
    groups?: TabGroup[];
    title: string;
};

type GenericTabProps = {
    languageManager: LanguageManager;
    tab: ConfigTab;
    draft: AppSettings | null;
    settings: AppSettings | null;
    onChange: (path: string[], value: JsonValue) => void;
    renderNode: (
        value: JsonValue | undefined,
        templateValue: JsonValue | undefined,
        path: string[],
        depth: number,
        onChange: (path: string[], value: JsonValue) => void,
    ) => React.ReactNode;
    getAtPath: (
        source: AppSettings | null,
        path: string[],
    ) => JsonValue | undefined;
};

export default function GenericTab({
    tab,
    draft,
    settings,
    onChange,
    renderNode,
    getAtPath,
    languageManager,
}: GenericTabProps) {
    const groups = tab.groups || [];
    return (
        <div className={styles.tabContent}>
            {groups.map((group) => (
                <section
                    key={group.title}
                    className={[styles.card, styles.group]
                        .filter(Boolean)
                        .join(" ")}
                >
                    <h3>{languageManager.translate(group.title)}</h3>
                    {group.placeholder ? (
                        <p className={styles.note}>{group.placeholder}</p>
                    ) : null}
                    {group.links ? (
                        <ul className={styles.linkList}>
                            {group.links.map(([label, href]) => (
                                <li key={href}>
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={() => openUrl(href)}
                                    >
                                        {languageManager.translate(label)} -{" "}
                                        {href.replace(/^mailto:/, "")}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {group.paths
                        ? group.paths
                              .map((path) => {
                                  const value = getAtPath(draft, path);
                                  const template = getAtPath(settings, path);
                                  if (
                                      value === undefined &&
                                      template === undefined
                                  ) {
                                      return null;
                                  }
                                  return (
                                      <div
                                          key={path.join(".")}
                                          className={styles.groupField}
                                      >
                                          {renderNode(
                                              value,
                                              template,
                                              path,
                                              0,
                                              onChange,
                                          )}
                                      </div>
                                  );
                              })
                              .filter(Boolean)
                        : null}
                </section>
            ))}
        </div>
    );
}
