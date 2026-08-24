// Ponte fra la barra mobile (che vive FUORI dal Drawer) e il Drawer stesso.
// La barra non può usare useNavigation(): non sta dentro il navigatore. Il
// bottone ☰ dell'header invece sì, e l'header è montato su OGNI schermata:
// è lui a depositare qui la navigation, e la barra la usa per aprire il menu.
import type { NavigationProp } from '@react-navigation/native';
import { DrawerActions } from '@react-navigation/native';

export const navRef: { corrente: NavigationProp<any> | null } = { corrente: null };

export function apriMenu(): void {
  navRef.corrente?.dispatch(DrawerActions.toggleDrawer());
}
