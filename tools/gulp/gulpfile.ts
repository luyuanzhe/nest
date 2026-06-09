import { parallel, series, task } from 'gulp';
import './tasks/clean';
import './tasks/copy-misc';
import './tasks/move';
import './tasks/samples';

task('move:all', parallel('move:node_modules', 'move:samples'));

task('prerelease:gulp', series('clean:bundle', 'copy-misc'));
