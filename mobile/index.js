import { AppRegistry } from 'react-native';
import App from './App';
import appConfig from './app.json';

const appName = appConfig?.name || 'crickeye-mobile';

AppRegistry.registerComponent(appName, () => App);
