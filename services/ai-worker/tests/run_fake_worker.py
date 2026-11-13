from entrypoints.worker import run
from tests.fake_runtime import FakeRuntime
import sys
run(FakeRuntime(),once='--once' in sys.argv)
