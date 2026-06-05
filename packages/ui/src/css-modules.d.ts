/**
 * Tipado de los CSS Modules para que `tsc` entienda `import styles from
 * "./x.module.css"`. Vite resuelve el módulo real en build; aquí solo damos la
 * forma (un mapa de nombre de clase local → nombre generado).
 */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
