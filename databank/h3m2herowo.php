<?php
use HeroWO\H3M;

$_takeOver = count(get_included_files()) < 2;
require_once __DIR__.'/core.php';

$h3m2json = __DIR__.'/h3m2json.php';
is_file($h3m2json) or $h3m2json = __DIR__.'/h3m2json/h3m2json.php';

if (is_file($h3m2json)) {
  require $h3m2json;

  class ConvertError extends H3M\CliError {}
} else {
  abstract class StubCLI {
    function helpText() {
      // Stop looking. I mean it!
    }

    function takeOver() {
      echo $this->helpText();
      exit(10);
    }
  }

  class_alias(StubCLI::class, 'HeroWO\\H3M\\CLI');
}

class CLI extends H3M\CLI {
  // Determined empirically.
  static $memory_limit = 1024;

  public $scriptFile = 'h3m2herowo.php';

  public $databankPath;
  public $debugFiles = false;
  public $outputHeroWoSubfolder = true;   // false, true, 'title'

  protected $convertor;

  function helpText() {
    $ds = DIRECTORY_SEPARATOR;

    $text = <<<HELP
Usage: $this->scriptFile [-options] -d databank/ input/|map.ext [output/]

Converts HoMM 3 maps to HeroWO format. Put h3m2json.php into $this->scriptFile's
folder or into h3m2json$ds in that folder (git clone).
Databank (-d) must match the map's game modification, if any (HotA, etc.).

Options specific to $this->scriptFile:
  -d PATH         mandatory: path to databank folder (produced by databank.php)
  -M              write debug files and preserve original .h3m and -o... file
  -off            single input map: put HeroWO files into the folder of
                  intermediate -o, do not create a subfolder
  -oft            no -off -nx: name output subfolders after map title, not file

Command line is the same as accepted by h3m2json.php, except output cannot be
stdout (-) because HeroWO maps are multi-file (regardless of the info below).
As with -of, -oft will overwrite files if map titles are not unique.
HELP;

    $inherited = parent::helpText();

    if ($inherited) {
      $inherited = preg_split('/\r?\n\r?\n/u', $inherited);
      $inherited = join(PHP_EOL.PHP_EOL, array_slice($inherited, 3, -2));
    } else {
      $inherited = <<<HELP
$this->scriptFile needs h3m2json.php. Download it to $this->scriptFile's folder or h3m2json$ds subfolder from:
https://github.com/HeroWO-js/h3m2json
HELP;
    }

    return $text.PHP_EOL.PHP_EOL.$inherited;
  }

  function parseArgv(array $argv) {
    foreach (array_reverse($argv, true) as $i => $arg) {
      switch ($arg) {
        case '-d':
          $this->databankPath = array_splice($argv, $i + 1, 1)[0];
          break;
        case '-M':
          $this->debugFiles = true;
          break;
        case '-off':
          $this->outputHeroWoSubfolder = false;
          break;
        case '-oft':
          $this->outputHeroWoSubfolder = 'title';
          break;
        default:
          continue 2;
      }

      array_splice($argv, $i, 1);
    }

    return parent::parseArgv($argv);
  }

  function run() {
    if ($this->outputPath === '-') {
      throw new ConvertError("Output path must be a file or folder, not stdout (-).");
    }

    if (!is_dir($this->databankPath)) {
      fwrite($this->outputStream, $this->helpText());
      return 1;
    }

    require_once __DIR__.'/databank.php';

    $this->convertor = new class extends Convertor {
      protected function readDatabank($file) {
        return file_get_contents("$this->databankPath/$file");
      }
    };

    $this->convertor->warner = function ($msg, $important) {
      if ($this->failOnWarning and $important) {
        throw new ConvertError("Warning treated as error (-ew): $msg");
      } else {
        fprintf($this->errorStream, "(*) %s%s", $msg, PHP_EOL);
      }
    };

    $this->convertor->databankPath = $this->databankPath;
    $this->convertor->loadDatabank();

    return parent::run();
  }

  protected function processFile($inputPath, $outputPath, $autoOutputPath) {
    $res = parent::processFile($inputPath, $outputPath, $autoOutputPath);

    if (isset($res['h3m']) and !is_resource($inputPath)) {
      extract($res);    // overrides arguments of this method

      $this->convertor->isTutorial = !strcasecmp(basename($inputPath), 'Tutorial.tut');
      $builder = $res['builder'] = $this->convertor->fromH3M($h3m);
      $builder->outputPath = $this->herowoSubfolder($outputPath, $h3m);
      is_dir($builder->outputPath) or mkdir($builder->outputPath);
      $builder->debugFiles = $this->debugFiles;
      $builder->write();

      // In non-M mode, delete the -o file (only needed for convertion). In -M mode,
      // copy input to the output
      // and move -o but only if not -off because it'd be already in $outputPath.
      //
      // Remember h3m2herowo.php doesn't allow $outputPath to be '-'.
      if (!$this->debugFiles) {
        unlink($outputPath);
      } else {
        copy($inputPath, $builder->outputPath.'/original.'.static::$formatToExtension[$inputFormat]);
        if ($this->outputHeroWoSubfolder) {
          rename($outputPath, $builder->outputPath.'/original.'.static::$formatToExtension[$outputFormat]);
        }
      }
    }

    return $res;
  }

  protected function herowoSubfolder($outputPath, H3M\H3M $h3m = null) {
    if ($this->outputHeroWoSubfolder === true) {
      // C:\foo\bar.json -> C:\foo\bar
      //
      // mkdir() fails on Windows if name has trailing whitespace (as
      // present in "Pandora's Box .h3m").
      return preg_replace('~\s*\.[^\\\\/]*$~u', '', $outputPath);
    } else {
      // C:\foo\bar.json -> C:\foo
      $res = preg_replace('~[\\\\/][^\\\\/]*$~u', '', $outputPath);
      if ($this->outputHeroWoSubfolder) {   // 'title'
        $res .= DIRECTORY_SEPARATOR.preg_replace('~[\\/:*?"<>|]~u', '', $h3m->name);
      }
      return $res;
    }
  }

  protected function checkSkipConverted($outputPath, $inputPath) {
    if ($this->skipConverted) {
      if ($this->outputHeroWoSubfolder === 'title') {
        throw new ConvertError("-oft is incompatible with -nx.");
      } else {
        return is_file($this->herowoSubfolder($outputPath, null).'/map.json');
      }
    }
  }
}

#[\AllowDynamicProperties]
abstract class Convertor {
  const VERSION = 2;

  public $warner;
  public $isTutorial;

  // XXX=I {Checks} only works for existing objects; it will fail when hero/monster was defeated

  static $seerHutQuest = [
    // SEERHUT.TXT[2]
    H3M\Quest_Level::class => [
      'I am old and wise, and I do not admit just anyone into my home.  You may enter when you have reached `{Checks`}.',
      'The reward I have is only for someone who is wise enough to handle it.  Achieve `{Checks`} and I will reward you.',
      // XXX=IC: hhqm: Slightly different message in SoD.
      'I am old, and dying.  Before I die I want to bequeath my possessions to someone worthy of them.  Achieve `{Checks`} and I will know of your worth.',
    ],
    // SEERHUT.TXT[7]
    H3M\Quest_PrimarySkills::class => [
      'I am a biographer of great heroes.  I\'d really like to meet a hero who has mastered `{Checks`}.  I\'d pay well for his story.',
      'For those who have attained `{Checks`} there are great rewards.  When you are finished return to me and I will see what can be done.',
      'I am not likely to speak with anyone who is lesser than myself.  If you have `{Checks`} then you will be better than I, and worthy of my attentions',
    ],
    // SEERHUT.TXT[12]
    H3M\Quest_DefeatHero::class => [
      'I was once rich and famous, but `{Checks`} the terrible was my downfall.  I lost my lands, I lost my title, and I lost my family.  Please, bring the villain to justice.',
      'Long ago I was in love, but `{Checks`} killed my sweetheart.  Please, destroy this evil villian so I may live the rest of my life knowing my love\'s killer has been brought to justice.',
      'We were driven from our home by `{Checks`}.  If you could make sure they will never bother us again we would reward you greatly.',
    ],
    // SEERHUT.TXT[17]
    H3M\Quest_DefeatMonster::class => [
      // XXX=IC:hhqm:
      'This land is menaced by `{Checks`}.  If you could be so bold as to defeat them, I would reward you richly.',
      'A group of `{Checks`} have driven us from our homes.  If you could drive them off we could go home, and would leave you with great rewards.',
      'In order to get to my sick mother I have to get by `{Checks`} first.  I am not a great warrior, but could reward you if the path was cleared.',
    ],
    // SEERHUT.TXT[22]
    H3M\Quest_Artifacts::class => [
      'Long ago, powerful wizards were able to create magical artifacts, but time has caused us to forget how to make new items.  I would like to learn these techniques myself, but I need one of these artifacts first to see how it was done.  If you could bring me, `{Checks`}, you would be well rewarded.',
      'I\'ve spent my life buying, selling, and collecting artifacts, but lately I\'ve been spending so much money acquiring new pieces I can hardly turn a profit.  I think I might be able to start mass-producing artifacts, but I\'ve got to have one first to copy.  If you could bring me `{Checks`}, I will reward your efforts.',
      'In my younger days I\'d have done this myself, but I need your help.  A friend of mine recently had a family heirloom stolen, and wants to find it.  The problem is that it looks exactly like `{Checks`}.  Please bring me any item that fits that description.  Even if the artifact is not the family heirloom, I will reward your efforts.',
    ],
    // SEERHUT.TXT[27]
    H3M\Quest_Creatures::class => [
      'I am an agent for an emperor of a distant land.  Recently, his armies have fallen on hard times.  If you could bring `{Checks`} to me, I could pay you handsomely.',
      'In order to travel through these dangerous lands my envoy needs more backup.  I hear `{Checks`} are excellent guards.  If you were to bring them to me I would be deeply grateful',
      'It is traditional for a groom to have an escort of `{Checks`} in order to go to his bride.  We were attacked and most of my escort was killed.  If you could persuade them to help me I would be very grateful.',
    ],
    // SEERHUT.TXT[32]
    H3M\Quest_Resources::class => [
      'I am researching a way to turn base metals into gold, but I am short of materials for my workshop.  If you could bring me `{Checks`}, I would be most grateful.',
      'Please help the poor children of the area.  If you could bring `{Checks`} we could pay to have homes built for them.  I would be at your service.',
      'Please help me!  I was robbed on the way to my wedding, and without a dowry my future husband will not be able to accept me.  If you could bring me `{Checks`} I would reward you.',
    ],
    // SEERHUT.TXT[37]
    H3M\Quest_BeHero::class => [
      'What I have is for `{Databank heroes`, name`, %d`} alone.  I shall give it to none other.',
    ],
    // SEERHUT.TXT[42]
    H3M\Quest_BePlayer::class => [
      'I have a prize for those who fly the %s flag.',
    ],
  ];

  static $seerHutProgress = [
    // SEERHUT.TXT[3]
    H3M\Quest_Level::class => [
      // XXX=IC:hhqm:
      'Faugh.  You again.  Come back when you are `{Checks`}, as I told you.',
      // XXX=IC:hhqm:
      'Not even close to `{Checks`}, leave me until you are there!',
      // XXX=IC:hhqm:
      'You are unworthy.  Only someone who is `{Checks`} will be worthy enough.',
    ],
    // SEERHUT.TXT[8]
    H3M\Quest_PrimarySkills::class => [
      'Have you found a great hero for me to interview?  He must have reached `{Checks`}.',
      'I am truly sorry, but you have not attained `{Checks`} and I will not help you until then.',
      'You are still unworthy.  Only someone with `{Checks`} will be better than I.',
    ],
    // SEERHUT.TXT[13]
    H3M\Quest_DefeatHero::class => [
      'Oh, I wish you brought better news.  It aches my heart that `{Checks`} still roams free.',
      'Still, the murder of my love, `{Checks`} is left to freely wander the world.',
      '`{Checks`} is still out there and can harm us.  Not until they are gone will we leave.',
    ],
    // SEERHUT.TXT[18]
    H3M\Quest_DefeatMonster::class => [
      // XXX=IC:hhqm:
      'Don\'t lose heart.  Defeating `{Checks`} is a difficult task, but you will surely succeed.',
      // XXX=IC:hhqm:
      'No, `{Checks`} have not been driven off.  Until then we cannot go home.',
      // XXX=IC:hhqm:
      'My route is still infested with `{Checks`}.  Please hurry, mother becomes more ill each day.',
    ],
    // SEERHUT.TXT[23]
    H3M\Quest_Artifacts::class => [
      'Nothing, eh?  I\'m sure you will find `{Checks`} soon.  Please keep looking.',
      'You still haven\'t found `{Checks`}?  Well please keep looking, I lose money with each passing day!',
      'Nothing yet?  Ah well, keep trying, I\'m sure `{Checks`} is out there somewhere.',
    ],
    // SEERHUT.TXT[28]
    H3M\Quest_Creatures::class => [
      // XXX=IC:hhqm:
      'No luck in finding `{Checks`}?  Please hurry, the empire depends on you.',
      // XXX=IC:hhqm:
      'I am sorry, but we really want `{Checks`} as guards.',
      // XXX=IC:hhqm:
      'No, those will simply not do.  You must bring me `{Checks`} before I can go to my bride to be.',
    ],
    // SEERHUT.TXT[33]
    H3M\Quest_Resources::class => [
      'Oh my, that\'s simply not enough.  I need `{Checks`}.  I\'ll never complete it with what you have.',
      'Not unless all of `{Checks`} is donated we cannot build adequate homes for the orphans.',
      'My dowry must contain all of `{Checks`} or I cannot get married.',
    ],
    // SEERHUT.TXT[38]
    H3M\Quest_BeHero::class => [
      'You are not `{Databank heroes`, name`, %d`}.  Begone!',
    ],
    // SEERHUT.TXT[43]
    H3M\Quest_BePlayer::class => [
      'Your flag is not %s.  I have nothing for you.  Begone!',
    ],
  ];

  static $seerHutComplete = [
    // SEERHUT.TXT[4]
    H3M\Quest_Level::class => [
      // XXX=IC:hhqm:
      'I thought you had promise.  You have indeed reached `{Checks`}. Come in, come in.  Here, I have something to reward you for your efforts.  Do you accept?',
      // XXX=IC:hhqm:
      'Ahhh, you have reached `{Checks`}.  Would you like to receive a reward?',
      // XXX=IC:hhqm:
      'Finally, there is someone to whom I can bequeath my worldly possessions, now that you have achieved `{Checks`} do you wish to inherit?',
    ],
    // SEERHUT.TXT[9]
    H3M\Quest_PrimarySkills::class => [
      'I\'ve always wanted to meet someone as famous as you.  Will you let me write down your life story?',
      'You have reached `{Checks`}, as I knew you would.  Are you ready to see the great rewards as a result?',
      'It is a great thing to meet someone better than I.  You have achieved `{Checks`}, will you accept the rewards of doing so?',
    ],
    // SEERHUT.TXT[14]
    H3M\Quest_DefeatHero::class => [
      'I thought the day would never come!  `{Checks`} is no more.  Please, will you accept this reward?',
      'Now I may continue with my sad life, that `{Checks`} has been brought to justice.  For this comfort would you accept a reward?',
      'We are finally able to return to our home, no that `{Checks`} has been defeated.  Would you accept a reward as a token of our gratitude?',
    ],
    // SEERHUT.TXT[19]
    H3M\Quest_DefeatMonster::class => [
      // XXX=IC:hhqm:
      'At last, you defeated `{Checks`}, and the countryside is safe again!  Are you ready to accept the reward?',
      // XXX=IC:hhqm:
      'Finally, `{Checks`} are gone from our home and we can return!  Will you accept this reward?',
      // XXX=IC:hhqm:
      'The route is clear, I thank you deeply.  Take this as a symbol of my gratitude.',
    ],
    // SEERHUT.TXT[24]
    H3M\Quest_Artifacts::class => [
      'Ah, exactly what I needed!  Here is the reward I promised.  You still wish to trade `{Checks`}, yes?',
      // XXX=IC:hhqm:
      'Yes!  `{Checks`} is perfect!  Now if you\'ll kindly give it to me, I shall pay what I promised.',
      'Yes, this might just be what we\'re looking for!  May I please have `{Checks`}?',
    ],
    // SEERHUT.TXT[29]
    H3M\Quest_Creatures::class => [
      'At last, the `{Checks`} that will save our empire!  Here is your payment. Are they ready to depart?',
      'Excellent!  You have brought us the right amount of `{Checks`} as guards.  Will you exchange them for a great reward?',
      'Thank you so much kind travelor!  I will give you a bountiful reward in exchange for the service of those `{Checks`}.',
    ],
    // SEERHUT.TXT[34]
    H3M\Quest_Resources::class => [
      'Finally!  Here, give the `{Checks`} to me, and I\'ll give you this in return.',
      'Ahh, with all of the `{Checks`} we can build good homes for them.  Would you accept this in return for your donation?',
      'Thank you so much kind travelor!  If you give me `{Checks`} I will give you a reward.  Will you trade?',
    ],
    // SEERHUT.TXT[39]
    H3M\Quest_BeHero::class => [
      'Finally!  It is you, `{Databank heroes`, name`, %d`}.  Here is what I have for you.  Do you accept?',
    ],
    // SEERHUT.TXT[44]
    H3M\Quest_BePlayer::class => [
      'Ah, one who bears the %s flag.  Here is a prize for you.  Do you accept?',
    ],
  ];

  static $questGuardQuest = [
    // SEERHUT.TXT[2]
    H3M\Quest_Level::class => [
      'The lands beyond are very dangerous.  The guards eye you dubiously, but agree to let you by when you have achieved the `{Checks`}.',
      // XXX=IC:hhqm:
      'I am sorry, but this is a guildhouse, and only those who are experienced enough can join.  Only those who are part of the guildhouse may pass.  Until you reach `{Checks`}, you may not join.',
      // XXX=IC:hhqm:
      'We have a problem with our King.  He doesn\'t like to be surrounded by immature people.  Therefore you need to be of `{Checks`} in order to pass through.',
    ],
    // SEERHUT.TXT[7]
    H3M\Quest_PrimarySkills::class => [
      'The guard post here is manned by retired heroes.  They will not let you pass until you can prove you have mastered `{Checks`}.',
      'Only those who have reached `{Checks`} are allowed to pass.  Our reasons are our own.',
      'A fair maiden languishes within the tower and only allows those who impress her to pass through.  You would need a `{Checks`} in order to impress her.',
    ],
    // SEERHUT.TXT[12]
    H3M\Quest_DefeatHero::class => [
      'The guards here protect the lands beyond from the depredations of `{Checks`}.  They will not let anyone pass so long as the threat remains.',
      'The guards were placed here in order to keep out `{Checks`}, a hero of great power and evil intentions towards their people.  Until they are defeated no one shall pass.',
      'The Queen wants `{Checks`} to be taught a lesson because they insulted her, calling her a fat old hag.  Until this is done she has closed the borders.',
    ],
    // SEERHUT.TXT[17]
    H3M\Quest_DefeatMonster::class => [
      // XXX=IC:hhqm:
      'The Belted Knights of Erathia guard this tower.  They will only let one of their own pass.  To join the order, you must first defeat `{Checks`}.',
      // XXX=IC:hhqm:
      'Beware, `{Checks`} are running loose out there.  We can\'t open the doors until each and every one is driven from the land.',
      'Our doors do not open for anyone.  Prove your loyalty by defeating our enemies, `{Checks`}.  Only then will you be allowed to pass.',
    ],
    // SEERHUT.TXT[22]
    H3M\Quest_Artifacts::class => [
      'A powerful wizard owns this tower.  He refuses to let you pass unless you bring him `{Checks`}.',
      'This gate can only be opened with a very special key.  Bring back `{Checks`} and you will be able to pass.',
      // XXX=IC:hhqm:
      'A small, henpecked man preers over the gate.  "No one may pass.  My dog ate my wife\'s, `{Checks`}, and I\'m not leaving here until I find a replacement.',
    ],
    // SEERHUT.TXT[27]
    H3M\Quest_Creatures::class => [
      'The King wants to see some `{Checks`}.  In order for him to do so we need to look outside the kingdom.  Bring us them and we\'ll let you through.',
      'Each year during our Festival of Life we need some `{Checks`}.  Bring some or don\'t bother coming back.  It is the only way you will pass.',
      'A mercenary troop occupies this tower.  They say they will let you pass if you bring them `{Checks`} as recruits.',
    ],
    // SEERHUT.TXT[32]
    H3M\Quest_Resources::class => [
      'The guards here are charging a toll of all travelers.  They will let you pass for `{Checks`}.',
      'All people must pay the King\'s Road Tax.  It is `{Checks`}.  Unless you pay it we will not let you pay.',
      'We are quite sorry, but we refuse to move out of here and let you through.  If you were to bring us `{Checks`} then we could move into another, comfortable home.',
    ],
    // SEERHUT.TXT[37]
    H3M\Quest_BeHero::class => [
      'The guards here say they have orders to only let `{Databank heroes`, name`, %d`} pass.',
    ],
    // SEERHUT.TXT[42]
    H3M\Quest_BePlayer::class => [
      'The guards here say they will only let those who fly the %s flag pass.',
    ],
  ];

  static $questGuardProgress = [
    // SEERHUT.TXT[3]
    H3M\Quest_Level::class => [
      // XXX=IC:hhqm:
      'The guards here simply will not permit anyone below `{Checks`} to pass.',
      // XXX=IC:hhqm:
      'There is no way we\'re going to let a wimp like you into our guild.  Not until you are of `{Checks`} can you join.',
      // XXX=IC:hhqm:
      'Only when you are of `{Checks`} will our King stand for your presence.',
    ],
    // SEERHUT.TXT[8]
    H3M\Quest_PrimarySkills::class => [
      'The retired heroes set you a series of tests, which you fail miserably.  Clearly you have not mastered `{Checks`}.',
      'You have not reached `{Checks`}, go away.',
      'She laughs because you have not yet reached `{Checks`}, and are not impressive.',
    ],
    // SEERHUT.TXT[13]
    H3M\Quest_DefeatHero::class => [
      'The guards still fear `{Checks`}, so you cannot pass.',
      '`{Checks`} is still running around on the loose.',
      '`{Checks`} has still not yet been taught a lesson.',
    ],
    // SEERHUT.TXT[18]
    H3M\Quest_DefeatMonster::class => [
      // XXX=IC:hhqm:
      'The Belted Knights still will not let you pass, so you have not conquered `{Checks`}.',
      // XXX=IC:hhqm:
      'No, `{Checks`} are still running loose.',
      'You have not yet proved your loyalty by defeating `{Checks`}.  Leave us.',
    ],
    // SEERHUT.TXT[23]
    H3M\Quest_Artifacts::class => [
      'The wizard is admant.  Without `{Checks`}, none will pass.',
      'You have not yet found the key, without `{Checks`} you cannot pass.',
      'Sorry, that won\'t fool her.  You need `{Checks`} in order to get me to leave.',
    ],
    // SEERHUT.TXT[28]
    H3M\Quest_Creatures::class => [
      // XXX=IC:hhqm:
      'I am sorry, but the King wants to only see `{Checks`}, nothing else will do.',
      'Nothing but `{Checks`} will do for our Festival.  Begone until you have them.',
      'The mercenaries still require `{Checks`} before you may pass.',
    ],
    // SEERHUT.TXT[33]
    H3M\Quest_Resources::class => [
      'Since you have not brought `{Checks`}, the guards forbid you passage.',
      'That is not enough.  The King\'s Road Tax is `{Checks`}.',
      'For that pathetic amount we couldn\'t buy a shack.  We\'ll need at least `{Checks`} in order to have a good home.',
    ],
    // SEERHUT.TXT[38]
    H3M\Quest_BeHero::class => [
      'The guards here will only let `{Databank heroes`, name`, %d`} pass.',
    ],
    // SEERHUT.TXT[43]
    H3M\Quest_BePlayer::class => [
      'The guards here will only let those who fly the %s flag pass.',
    ],
  ];

  static $questGuardComplete = [
    // SEERHUT.TXT[4]
    H3M\Quest_Level::class => [
      // XXX=IC:hhqm:
      'The guards acknowledge that you have indeed reached `{Checks`}.  Do you wish to pass at this time?',
      // XXX=IC:hhqm:
      'Now that you have reached `{Checks`} level you may join our guild.  Membership is free.  Do you wish to pass at this time?',
      // XXX=IC:hhqm:
      'Excellent!  Now that you are of `{Checks`} our King will not have any problems with you.  Do you wish to pass at this time?',
    ],
    // SEERHUT.TXT[9]
    H3M\Quest_PrimarySkills::class => [
      'The retired heroes set you a series of tests, which you pass easily, demonstrating your mastery of `{Checks`}.  Do you wish to pass?',
      'You have reached `{Checks`}.  Do you wish to pass?',
      'She is very impressed by you because you have reached `{Checks`}.  Do you wish to pass now?',
    ],
    // SEERHUT.TXT[14]
    H3M\Quest_DefeatHero::class => [
      'Now that you have vanquished `{Checks`}, the threat is gone.  Do you wish to pass?',
      'Since `{Checks`} has been defeated and is no longer a threat the guards may let people pass.  Do you wish to pass at this time?',
      'You have taught `{Checks`} a lesson so the Queen will allow people to pass.  Do you wish to at this time?',
    ],
    // SEERHUT.TXT[19]
    H3M\Quest_DefeatMonster::class => [
      // XXX=IC:hhqm:
      'News of your defeat of `{Checks`} traveled quickly.  Do you wish to pass, oh newly Belted Knight?',
      'Now that `{Checks`} are gone we can open our doors.  Would you like to enter at this time?',
      'Your loyalty has been proven by defeating `{Checks`}.  Do you wish to pass at this time?',
    ],
    // SEERHUT.TXT[24]
    H3M\Quest_Artifacts::class => [
      'The wizard agrees to let you by in exchange for `{Checks`}.  Do wish to pass at this time?',
      'Using `{Checks`} you may open the gate and pass through.  Do you wish to pass at this time?',
      // XXX=IC:hhqm:
      '"Give it here and you can pass.  Want a dog?  Just kidding, will you give `{Checks`} to me?"',
    ],
    // SEERHUT.TXT[29]
    H3M\Quest_Creatures::class => [
      'Excellent!  You have found the `{Checks`} the King is so anxious to see.  Let them go with us and you may pass.',
      'Excellent!  You may pass if you give us the `{Checks`}.  Will you make the exchange now?',
      'The mercenaries agree to let you pass in exchange for `{Checks`} as recruits.  Do you wish to make the exchange now?',
    ],
    // SEERHUT.TXT[34]
    H3M\Quest_Resources::class => [
      'The guards here are charging a toll of all travelers.  They will let you pass for `{Checks`}.  Do you wish to pay the toll?',
      'If you give us the King\'s Road Tax of `{Checks`} we will let you pass.  Do you agree?',
      'Now that is the right kind of money.  With `{Checks`} we can build or buy ourselves a nice place.  You give it here and we let you pass, eh?',
    ],
    // SEERHUT.TXT[39]
    H3M\Quest_BeHero::class => [
      'At last, it is `{Databank heroes`, name`, %d`}.  Do you wish to pass?',
    ],
    // SEERHUT.TXT[44]
    H3M\Quest_BePlayer::class => [
      'The guards note your %s flag and offer to let you pass.  Do you accept?',
    ],
  ];

  // Databank's data.
  protected $nameToID;
  protected $constants;
  protected $producers;
  protected $classes;
  protected $heroes;
  protected $buildings;
  protected $creatures;
  protected $spells;
  protected $skills;
  protected $towns;
  protected $artifacts;
  protected $hallBuildings;
  protected $dwellings;   // array of AClass->$id for dwelling class => array of Creature->$id that they produce
  protected $terrainByH3;   // SoD class '-' subclass => AClass->$id
  protected $riverByH3;
  protected $roadByH3;
  protected $objectByH3;
  //protected $o_OPERATION;

  protected $stats = ['attack', 'defense', 'spellPower', 'knowledge'];

  protected $h3m;       // the input
  protected $builder;   // the output
  protected $h3mObjectIDs;
  // Array of regular 'hero' AObject-s (not randomHero or heroPlaceholder).
  protected $heroObjects;
  protected $resolveH3mObjectIDs;
  protected $minX;
  protected $minY;
  protected $maxX;
  protected $maxY;
  protected $effectLabel = 0;   // next available labeled Effect index

  // function ( [$important = true,] $msg [, $formatArg1, ...] )
  function warning($important) {
    if ($this->warner) {
      $args = func_get_args();
      is_bool($important) ? array_shift($args) : $important = true;
      call_user_func($this->warner, call_user_func_array('sprintf', $args),
                     $important, $this);
    }
  }

  // Drops previously loaded databank, if any.
  //
  // It's okay to loadDatabank() just once when converting multiple maps (if
  // they all use the same databank/modification),
  function loadDatabank() {
    $this->nameToID = [];

    foreach (['constants', 'producers'] as $index) {
      $this->$index = json_decode($this->readDatabank("$index.json"), true);
    }

    $stores = ['classes', 'heroes', 'buildings', 'creatures', 'spells',
               'skills', 'towns', 'artifacts'];
    foreach ($stores as $store) {
      $this->$store = ObjectStore::from(json_decode($this->readDatabank("$store.json"), true));
    }

    foreach ($this->const('effect.operation') as $name => $value) {
      $this->{"o_$name"} = $value;
    }

    $this->o_clamp00 = [$this->o_clamp, 0, 0];
    $this->o_false = [$this->o_const, false];

    // Unrolling is permanent and we assume if somebody runs several convertions
    // per process, they are doing so with a compatible (same) databank.
    if (!isset(Map::$unrolled['resources'])) {
      unrollStores([
        'constants' => $this->constants,
        'artifactSlotsID' => $this->nameToID('artifactSlots'),
        'buildingsID' => $this->nameToID('buildings'),
      ]);

      // Part of databank.php, not handled by unrollStores().
      Hero::$compact['artifacts']['strideX'] = max($this->nameToID('artifactSlots')) + 1;
    }

    $this->hallBuildings = [
      $this->nameToID('buildings', 'hall'),
      $this->nameToID('buildings', 'townHall'),
      $this->nameToID('buildings', 'cityHall'),
      $this->nameToID('buildings', 'capitol'),
    ];

    $this->dwellings = $this->terrainByH3 = $this->riverByH3 = [];
    $this->roadByH3 = $this->objectByH3 = [];

    for ($id = 0; $id < $this->classes->x(); $id++) {
      $type = $this->classes->atCoords($id, 0, 0, 'type');
      if (AObject::type[$type] === 'dwelling') {
        $this->dwellings[$id] = $this->classes->atCoords($id, 0, 0, 'produce');
      }

      switch ($type = AObject::type[$type]) {
        default:
          $type = 'object';
        case 'terrain':
        case 'river':
        case 'road':
          $class = $this->classes->atCoords($id, 0, 0, 'class');
          $subclass = $this->classes->atCoords($id, 0, 0, 'subclass');
          $this->{$type.'ByH3'}["$class-$subclass"][] = $id;
      }
    }
  }

  abstract protected function readDatabank($file);

  // Fetches value of dot-separated $path resolving to a constant.
  // const('resources.wood');
  function const($path) {
    $cur = $this->constants;
    foreach (explode('.', $path) as $name) { $cur = $cur[$name]; }
    return $cur;
  }

  // Shortcut for creating an $append modifier:
  // o_append(123);         //=> [$append, 123]
  // o_append([1, 2, 3]);   //=> [$append, 1, 2, 3]
  protected function o_append($values) {
    return array_merge([$this->o_append], (array) $values);
  }

  protected function effect(array $effect) {
    $this->effects([$effect]);
  }

  protected function effects(array $effects) {
    mergeInto($this->builder->effects, $effects);
  }

  // function ($index) - return parsed $index.json
  // function ($index, $name) - return value for $name key, or throw
  // function ($index, $name, $default) - for $name, or $default (and warn)
  function nameToID($index, $name = null, $default = null) {
    $ref = &$this->nameToID[$index];
    $ref or $ref = json_decode($this->readDatabank("{$index}ID.json"), true);

    if (!isset($name)) {
      return $ref;
    } elseif (isset($ref[$name])) {
      return $ref[$name];
    } elseif (func_num_args() > 2) {
      $this->warning("cannot resolve '%s' in %s, assuming %s",
        $name, $index, json_encode($default));
      return $default;
    } else {
      throw new ConvertError("Cannot resolve '$name' in $index.");
    }
  }

  // h3m2json.php tries to convert many well-known (standard) values to
  // strings, like map difficulty. If a value is not well-known, it's stored as
  // an integer. Since h3m2herowo.php doesn't support such values either, it
  // tries to use default (fallback) values.
  //
  // known() checks value of $obj->$prop while knownValue() checks the immediate
  // value, using $prop only for diagnostic messages. If $default is null,
  // convertion is aborted with an exception.
  protected function known(H3M\Structure $obj, $prop, $default = null) {
    $args = [$prop, $obj->$prop];
    func_num_args() > 2 and $args[] = $default;
    return $this->knownValue(...$args);
  }

  // See known().
  protected function knownValue($prop, $value, $default = null) {
    if (is_int($value)) {
      if (func_num_args() > 3) {
        $this->warning("unknown '%s' value: %s, assuming: %s", $prop,
          json_encode($value), json_encode($default));
        $value = $default;
      } else {
        throw new ConvertError("Unknown '$prop' value: $value");
      }
    }

    return $value;
  }

  // $id - index in the list of "object details" section of .h3m. Not $objectID
  // as read by h3m2json.php.
  protected function objectByH3mID($id, object $referrer = null) {
    $ref = $this->h3mObjectIDs[$id] ?? null;

    if (!is_int($id) or !$ref) {
      $referrer and $referrer = ', referenced by '.get_class($referrer);
      throw new ConvertError("Non-existing object: #$id$referrer.");
    }

    return $ref;
  }

  // Kickstarts the actual convertion from .h3m to HeroWO's bunch-o'-JSON.
  function fromH3M(H3M\H3M $h3m) {
    if ($this->nameToID === null) {
      throw new ConvertError('Call loadDatabank() before fromH3M().');
    }

    if ($h3m->_version !== static::VERSION) {
      // Version of databank format should also match but we're implying it
      // does because this script is distributed along with databank scripts.
      $this->warning("%s is designed for map version %s but your h3m2json.php produces version %s; this may cause problems",
        (new CLI)->scriptFile, static::VERSION, $h3m->_version);
    }

    if (!($h3m->specialWeeks ?? true) or isset($h3m->roundLimit)) {
      $this->warning('unsupported HotA feature(s) of H3M, ignoring');
    }

    $this->h3m = $h3m;
    $builder = $this->builder = new MapBuilder;

    $this->h3mObjectIDs = $this->heroObjects = $this->resolveH3mObjectIDs = [];

    $map = $builder->map = new Map;
    $map->modules = ['H3'];
    $map->width = $h3m->size;
    $map->height = $h3m->size;
    $map->levels = $h3m->twoLevels + 1;
    $map->origin = $this->known($h3m, 'format', "_".dechex((int) $h3m->format));
    // Using map's difficulty as the default for player's difficulty mode.
    $map->difficulty = $map->difficultyMode = $this->const('map.difficulty.'.$this->known($h3m, 'difficulty', 'normal'));
    // SoD shows "Unnamed" in main menu (list of maps) and blank string in in-game Scenario Information.
    $map->title = $h3m->name ?? 'Unnamed';
    $map->description = $h3m->description ?? '';
    $map->constants = $this->constants;
    // Ignoring H3M->$isPlayable, $sizeText.

    // First convert map objects, starting with tiles.
    foreach ($h3m->overworldTiles as $i => $tile) {
      $this->fromH3mTile($tile, $i, 0);
    }

    foreach ($h3m->underworldTiles ?: [] as $i => $tile) {
      $this->fromH3mTile($tile, $i, 1);
    }

    // Now regular objects coming in.
    $this->minX = $this->minY = 0;
    $this->maxX = $this->maxY = $h3m->size - 1;

    foreach ($h3m->objects as $id => $object) {
      $this->fromH3mObject($object, $id);
    }

    $this->addMapMargin();

    // Converting rest of map data - players, heroes, etc.
    // Final object IDs are now available.

    $obj = $map->players[] = new MapPlayer;
    $obj->player = $this->nameToID('players', 'neutral');
    $obj->controllers = [['type' => 'neutralAI']];

    $onlyHuman = $otherHuman = null;

    if (!array_filter(array_column($h3m->players, 'canBeHuman'))) {
      $this->warning('no human players, enabling $canBeHuman for Red');
      $h3m->players['red']->canBeHuman = true;
    }

    foreach ($h3m->players as $color => $player) {
      if ($player->canBeHuman) {
        $player->canBeComputer or $onlyHuman = $onlyHuman ?? count($map->players);
        $otherHuman = $otherHuman ?? count($map->players);
      }
      $this->fromH3mPlayer($player, $color);
    }

    // Set default controller for players that can be both human and CPU to CPU, except setting the
    // first such player to human if there are no human-only players.
    // This allows starting new single-player game without configuration.
    foreach ($map->players as $i => $player) {
      if (count($player->controllers) === 2) {    // 0 human, 1 ai
        $player->controller = $i === ($onlyHuman ?? $otherHuman) ? 0 : 1;
      }
    }

    foreach ($h3m->heroes as $id => $hero) {
      $this->fromH3mCustomHero($hero, $id);
    }

    $this->fromH3mVictoryCondition($h3m->victoryCondition);
    $this->fromH3mLossCondition($h3m->lossCondition);
    $this->fromH3mChances();
    $this->fromH3mHeroChances();  // handles Hero->$players (of $h3m->heroes)
    $this->fromH3mRumors($h3m->rumors);

    foreach ($h3m->events as $event) {
      $this->fromH3mEvent($event);
    }

    if ($this->isTutorial) {
      $event = new H3M\Event;
      $res = $event->resources = new H3M\Resources;
      // So that Red has 50 each resource and 50k gold.
      $res->wood = $res->ore = 30;
      $res->mercury = $res->sulfur = $res->crystal = $res->gems = 40;
      $res->gold = 30000;
      $event->players = ['red'];
      $event->firstDay = 0;
      $this->fromH3mEvent($event);
    }

    foreach ($this->resolveH3mObjectIDs as &$ref) {
      list($obj, $prop, $h3mID) = $ref;
      $id = $this->objectByH3mID($h3mID, $obj)->id;
      // Preserve reference in [1], as in fromH3m_QuestGuard().
      isset($obj) ? $obj->$prop = $id : $ref[1] = $id;
      if ($prop === 'visiting' or $prop === 'garrisoned') {
        $builder->objects[$id]->$prop = $obj->id;   // assign hero's $visiting
      }
    }

    // Do this after resolving IDs because finishH3mObjects() reads AObject->$visiting
    // of heroes but it's only set above.
    $this->finishH3mObjects();

    // This is stored in staticEffectsSchema.json
    // but it matches H3Effect::$normalize that we have available so take that.
    Effect::$normalize = H3Effect::$normalize;

    // Lastly, combine databank's static Effects with map-specific ones.
    $builder->effects = array_merge(
      H3Effect::fromShort(
        $builder->effects,
        [],
        [
          'priority' => $this->const('effect.priority.mapSpecific'),
        ]
      ),
      array_map(
        function ($effect) {
          return new H3Effect($effect);
        },
        json_decode(file_get_contents("$this->databankPath/staticEffects.json"), true)
      )
    );

    $builder->labeledEffects = array_merge(
      array_map(function (array $effects) {
        return H3Effect::fromShort($effects);
      }, $builder->labeledEffects),
      array_map(
        function (array $effects) {
          return array_map(function ($effect) {
            return new H3Effect($effect);
          }, $effects);
        },
        json_decode(file_get_contents("$this->databankPath/staticLabeledEffects.json"), true)
      )
    );

    $builder->originalIDs = array_column($this->h3mObjectIDs, 'id');
    $builder->classes = $this->classes;

    return $builder;
  }

  protected function fromH3mPlayer(H3M\Player $player, $color) {
    $obj = $this->builder->map->players[] = new MapPlayer;
    $obj->player = $this->nameToID('players', $color);
    $obj->team = $player->team + 1;
    $obj->maxLevel = $this->h3m->maxHeroLevel;
    $player->canBeHuman and $obj->controllers[] = ['type' => 'human'];

    if ($player->canBeComputer) {
      $beh = $this->known($player, 'behavior', 'random');
      $obj->controllers[] = ['type' => 'ai'] +
        ($this->isTutorial ? ['behavior' => 'nop'] : []) +
        ($beh === 'random' ? [] : ['behavior' => $beh]);
    }

    // SoD Complete allows Conflux even in scenarios created for earlier versions (e.g. for AB). So do we.
    foreach ($player->towns as $town) {
      if (null !== $town = $this->knownValue('towns', $town, null)) {
        $obj->towns[] = $this->nameToID('towns', $town);
      }
    }

    if (is_int($id = $player->startingTown->object ?? null)) {
      $obj->startingTown = $this->objectByH3mID($id, $player->startingTown)->id;
    }

    $this->fromH3mPlayerStartingHero($obj, $player);

    // Ignoring $customizedTowns since $towns reflects its state.
    // Ignoring $placeholderHeroes and $heroes, have no use for that.
  }

  protected function fromH3mPlayerStartingHero(MapPlayer $player, H3M\Player $h3mPlayer) {
    if ($player->startingTown and $h3mPlayer->startingTown->createHero) {
      $createInTown = $this->builder->objects[$player->startingTown];

      if ($createInTown->visiting) {
        $this->warning("not generating starting hero because another hero is visiting #%d", $createInTown->id);
      } else {
        $obj = $this->newObject(null, [
          'class' => $this->nameToID('objects', 'randomHero')[0],
          'x' => $createInTown->x + 2,    // adjust to town's actionable spot
          'y' => $createInTown->y + 4,
          'z' => $createInTown->z,
          'owner' => $player->player,
          'visiting' => $createInTown->id,
        ]);

        $object = $this->h3m->objects[$h3mPlayer->startingTown->object];
        $obj->displayOrder = $this->objectDisplayOrder($obj, $object, $object->index + 1);
        $createInTown->visiting = $obj->id;
      }
    }

    $randomHero = $fixedHero = null;

    foreach ($this->builder->objects as $obj) {
      if ($obj->owner === $player->player and
          in_array($obj->class, $this->nameToID('objects', 'randomHero'))) {
        $randomHero = $obj;
        break;
      }
    }

    // Since we don't know the exact algorithm SoD's editor uses for
    // determining starting hero, we can try relying on $type. This should work
    // as long as GH is off and there are no random heroes (but if any of this
    // is false then $fixedHero won't be used anyway), and there are no heroes
    // with duplicate identities (diminishingly rare, if possible at all).
    foreach ($this->heroObjects as $obj) {
      if ($obj->owner === $player->player and
          // Set $fixedHero to the first hero object owned by player. However,
          // if there is another hero object with $subclass matching H3M's $type
          // then use the first one such hero.
          (!$fixedHero or
           $found = $obj->subclass === $h3mPlayer->startingHero->type)) {
        $fixedHero = $obj;
        if (!empty($found)) { break; }
      }
    }

    if ($randomHero) {
      $player->startingHero = $randomHero->id;
      // Match Hero->$id.
      $player->startingHeroClasses = $this->h3m->startingHeroes;
    } elseif ($fixedHero) {
      // If there is a hero but it's not random and Generate Hero is unset,
      // SoD shows "None" in Advanced Options while we show that hero's face.
      $player->startingHero = $fixedHero->id;
      $player->startingHeroClasses = $fixedHero->subclass;
    }

    // Ignoring StartingTown->type/x/y/z, have no use for that.
    // Ignoring StartingHero->random, no use either.
    //
    // Ignoring potentially confusing StartingHero->face/name. SoD shows
    // $name in Advanced Options but it looks more like a glitch (see
    // h3m-The-Corpus.txt).
  }

  protected function fromH3mVictoryCondition(H3M\VictoryCondition $cond = null) {
    switch (get_class($cond ?: new \stdClass)) {
      case H3M\VictoryCondition_AcquireArtifact::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownArtifact'),
          'artifact' => $cond->artifact,    // matches Artifact->$id
        ]);
        break;
       case H3M\VictoryCondition_AccumulateCreatures::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownCreatures'),
          'unit' => $cond->creature,  // matches Creature->$id
          'unitCount' => $cond->count,
        ]);
        break;
      case H3M\VictoryCondition_AccumulateResources::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownResources'),
          'resource' => $this->const('resources.'.$this->known($cond, 'resource')),
          'resourceCount' => $cond->quantity,
        ]);
        break;
      case H3M\VictoryCondition_BuildGrail::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownTown'),
          'townGrail' => true,
        ]);
        if (isset($cond->object)) {
          $obj->object = $this->objectByH3mID($cond->object, $cond)->id;
          $obj->objectType = $this->const('object.type.town');
        }
        // Ignoring $cond->x/y/z, covered by $cond->object.
        break;
      case H3M\VictoryCondition_DefeatHero::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.defeat'),
          'object' => $this->objectByH3mID($cond->object, $cond)->id,
          'objectType' => $this->const('object.type.hero'),
        ]);
        // Ignoring $cond->x/y/z, covered by $cond->object.
        break;
      case H3M\VictoryCondition_CaptureTown::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.defeat'),
          'object' => $this->objectByH3mID($cond->object, $cond)->id,
          'objectType' => $this->const('object.type.town'),
        ]);
        // Ignoring $cond->x/y/z, covered by $cond->object.
        break;
      case H3M\VictoryCondition_DefeatMonster::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.defeat'),
          'object' => $this->objectByH3mID($cond->object, $cond)->id,
          'objectType' => $this->const('object.type.monster'),
        ]);
        // Ignoring $cond->x/y/z, covered by $cond->object.
        break;
      case H3M\VictoryCondition_UpgradeTown::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownTown'),
          'townHall' => $this->const('mapVictory.townHall.'.$this->known($cond, 'hall')),
          'townCastle' => $this->const('mapVictory.townCastle.'.$this->known($cond, 'fort')),
        ]);
        if (isset($cond->object)) {
          $obj->object = $this->objectByH3mID($cond->object, $cond)->id;
          $obj->objectType = $this->const('object.type.town');
        }
        // Ignoring $cond->x/y/z, covered by $cond->object.
        break;
      case H3M\VictoryCondition_FlagDwellings::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownDwelling'),
        ]);
        break;
      case H3M\VictoryCondition_FlagMines::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownMine'),
        ]);
        break;
      case H3M\VictoryCondition_TransportArtifact::class:
        $obj = $this->builder->map->victory[] = new MapVictory([
          'type' => $this->const('mapVictory.type.ownArtifact'),
          'artifact' => $cond->artifact,  // matches Artifact->$id
          'object' => $this->objectByH3mID($cond->object, $cond)->id,
          'objectType' => $this->const('object.type.town'),
        ]);
        break;
      default:
        $this->warning("unexpected VictoryCondition class: %s, assuming normal victory", get_class($cond));
        $cond = null;    // allow normal victory
      case \stdClass::class:
    }

    if ($cond and !$cond->applyToComputer) {
      $obj->allowAI = false;
    }

    if (!$cond or $cond->allowNormal) {
      $this->builder->map->victory[] = new MapVictory;
      // Not sure if $allowAI should be set for normal victory in case $cond
      // allows normal. Probably yes.
    }
  }

  protected function fromH3mLossCondition(H3M\LossCondition $cond = null) {
    switch (get_class($cond ?: new \stdClass)) {
      case H3M\LossCondition_LoseTown::class:
        $this->builder->map->loss[] = new MapLoss([
          'type' => $this->const('mapLoss.type.lose'),
          'object' => $this->objectByH3mID($cond->object, $cond)->id,
          'objectType' => $this->const('object.type.town'),
        ]);
        break;
      case H3M\LossCondition_LoseHero::class:
        $this->builder->map->loss[] = new MapLoss([
          'type' => $this->const('mapLoss.type.lose'),
          'object' => $this->objectByH3mID($cond->object, $cond)->id,
          'objectType' => $this->const('object.type.hero'),
        ]);
        break;
      case H3M\LossCondition_TimeExpires::class:
        $this->builder->map->loss[] = new MapLoss([
          'type' => $this->const('mapLoss.type.days'),
          'time' => $cond->days,
        ]);
        break;
      default:
        $this->warning("unexpected LossCondition class: %s, assuming normal loss", get_class($cond));
      case \stdClass::class:
    }

    $this->builder->map->loss[] = new MapLoss;
  }

  protected function fromH3mChances() {
    // Matches Artifact->$id.
    if ($artifacts = $this->h3m->unavailableArtifacts) {
      // Short form of 'override' modifier operation.
      $this->effect(['artifactChance', array_fill_keys($artifacts, null), 'source' => $this->const('effect.source.initialize')]);
    }

    foreach ($this->h3m->unavailableSpells as $spell) {
      // XXX=R: hhsi: Databank's Spell->$id is declared as different from SPTRAITS.TXT index. However, we don't have means to map the two other than by idName which for some spells is different from makeIdentifier(). But not only that, we don't have access to SPTRAITS.TXT and can't look up spell name (or other info, e.g. $description). All we have is SoD's spell ID. Leaving fixing this for later since as of now Spell->$id-s of "userland" spells do match.
      $this->effect(['town_spellChance', $this->o_clamp00, 'ifSpell' => $spell, 'source' => $this->const('effect.source.initialize')]);
    }

    foreach ($this->h3m->unavailableSkills as $skill) {
      // Matches Skill->$id.
      $this->effect(['hero_skillChance', $this->o_clamp00, 'ifSkill' => $skill, 'source' => $this->const('effect.source.initialize')]);
    }
  }

  protected function fromH3mHeroChances() {
    // Disable heroes globally disabled in Map Specifications.
    $banned = array_flip(array_diff($this->nameToID('heroes'), $this->h3m->startingHeroes));

    // Re-enable hero classes of hero objects on map (including visiting and
    // garrisoned). HeroWO automatically excludes existing heroes from the pool.
    foreach ($this->heroObjects as $obj) {
      unset($banned[$obj->subclass]);
    }

    if ($banned) {
      $this->effect([
        'heroChance',
        // Short form of 'override' modifier operation.
        array_fill_keys(array_keys($banned), null),
        'source' => $this->const('effect.source.initialize'),
      ]);
    }

    // Disable heroes with player availability specified in custom hero options.
    $playerBannedHeroes = [];   // 'red' => array of Hero->$id

    // $id matches Hero->$id.
    foreach ($this->h3m->heroes as $id => $hero) {
      if (isset($hero->players)) {
        $banned = array_diff(array_keys($this->nameToID('players')),
                             $hero->players, ['neutral']);
        foreach ($banned as $p) { $playerBannedHeroes[$p][] = $id; }
      }
    }

    foreach ($playerBannedHeroes as $player => $banned) {
      $this->effect([
        'heroChance',
        // Short form of 'override' modifier operation.
        array_fill_keys($banned, [0, $this->o_clamp, 0, 0]),
        'ifPlayer' => $this->nameToID('players', $player),
        'source' => $this->const('effect.source.initialize'),
      ]);
    }
  }

  protected function fromH3mCustomHero(H3M\Hero $hero, $id) {
    // $hero->players is processed in fromH3mHeroChances().

    $ref = &$this->builder->databankOverrides['heroes'][$id];
    $overrides = $ref = new Hero;

    $overrides->baseObject = $this->heroes->objectAtContiguous($this->heroes->toContiguous($id, 0, 0, 0));

    isset($hero->name)      and $overrides->name      = $hero->name;
    isset($hero->biography) and $overrides->biography = $hero->biography;

    if (isset($hero->face)) {
      // $face matches Hero->$id and means "copy portrait of that hero to $hero".
      $overrides->portrait = $this->heroes->atCoords($hero->face, 0, 0, 'portrait');
    }

    if (isset($hero->gender)) {
      $gender = $this->known($hero, 'gender', null);
      if (isset($gender)) {
        $overrides->gender = $this->const('hero.gender.'.$gender);
      }
    }

    if (isset($hero->skills)) {
      $skills = $this->fromH3mSkills($hero->skills, ['ifObject' => true, 'stack' => $this->const('effect.stack.classStats')]);
      $overrides->skills = H3Effect::fromShort($skills, [], ['priority' => $this->const('effect.priority.hero')]);
    }

    if (isset($hero->spells)) {
      $overrides->spells = [];
      if ($hero->spells) {
        // XXX=R:hhsi:
        $spells = [['hero_spells', $this->o_append($hero->spells), 'ifObject' => true, 'stack' => $this->const('effect.stack.classStats')]];
        $overrides->spells = H3Effect::fromShort($spells, [], ['priority' => $this->const('effect.priority.hero')]);
      }
    }

    if (isset($hero->artifacts)) {
      $overrides->artifacts = $this->fromH3mEquippedArtifacts($hero->artifacts);
    }

    // SoD's editor allows changing primary skills which are part of hero
    // class, not hero. We could create an ad-hoc HeroClass just for this
    // override, but it'd break checks like "is Knight". Using Effects is
    // better.
    if (isset($hero->attack)) {
      foreach ($this->stats as $prop) {
        // Priority of this must be lower than priority of stat Effects produced in fromH3m_Hero().
        $hero->$prop and $this->effect([
          "hero_$prop",
          $hero->$prop,
          'ifHero' => $id,
          // Stack priority is higher than that used by _initializeObjects().
          'stack' => [$this->const('effect.stack.classStats'), 1],
        ]);
      }
    }

    if (isset($hero->experience)) {
      $this->builder->map->initialHeroExperiences[$id] = $hero->experience;
    }
  }

  protected function fromH3mRumors(array $rumors) {
    if ($rumors) {
      // Ignoring Rumor->$name, it isn't used outside of the editor.
      $rumors = array_column($rumors, 'description');
      $this->effect(['randomRumors', $this->o_append($rumors), 'source' => $this->const('effect.source.initialize')]);
      // XXX=C do map-provided rumors have a higher chance of being shown in Tavern?
      //
      // XXX=C do they override standard rumors?
    }
  }

  protected function fromH3mEvent(H3M\Event $event, array $bonuses = [], array $selectors = []) {
    $bonuses += [
      'name' => $event->name,
      // No audio in this message.
      'message' => $event->message,
      'resources' => $this->fromH3mResources($event->resources),
    ];

    $selectors += [
      'ifObject' => 0,
      'ifBonusObject' => 0,
    ];

    $dateSelectors = [
      'ifDateMin' => $event->firstDay,
      'ifDateMax' => $event->firstDay,
    ];

    $event->repeatDay or $selectors += $dateSelectors;

    $players = array_intersect(array_keys($this->h3m->players), $event->players);
    $players === $this->h3m->players and $players = [null];
    $controllers = [$this->playerController($event->applyToHuman, $event->applyToComputer)];
    // Timed events must not fire if the town is owned by neutral so if there's no $ifPlayer selector then set $iPC to not match 'neutralAI'.
    if (!isset($players[0]) and !$controllers[0]) {
      $controllers = ['human', 'ai'];
    }

    foreach ($controllers as $controller) {
      foreach ($players as $player) {
        $selectors = [
          'ifPlayer' => $player ? $this->nameToID('players', $player) : null,
          'ifPlayerController' => $controller,
        ] + $selectors;

        $effects = $this->bonusEffects($bonuses, $selectors + ($event->repeatDay ? ['maxDays' => 1] : []), true);

        if ($event->repeatDay) {
          $label = 'm'.$this->effectLabel++;
          $effects[] = ['bonus_effects', [$label, $this->o_append], 'ifDateMin' => -$event->repeatDay, 'ifDateMax' => -$event->repeatDay] + $selectors;
          $this->builder->labeledEffects[$label] = $effects;
          // The shortcut $modifier = ['label', ...] form is only available when GenericEncounter adds (embedded) bonus_effect from another bonus_effect.
          $effects = [bonus_effects([$this->o_append([['bonus_effects', [$label, $this->o_append]] + $selectors + $dateSelectors])]) + $selectors + $dateSelectors];
        }

        $this->effects($effects);
      }
    }
  }

  protected function playerController($allowHuman, $allowAI) {
    if (!$allowHuman or !$allowAI) {
      return $allowHuman ? 'human' : 'ai';
    }
  }

  protected function bonusEffects(array $bonuses, $selectors, $stackMessages = false) {
    is_array($selectors) or $selectors = ['ifBonusObject' => $selectors];
    $effects = $bonus_effects = [];

    foreach ($bonuses as $key => $value) {
      switch ($key) {
        default:
          throw new ConvertError("Invalid bonusEffects() key: $key");

        case 'name':
          break;  // Ignore, no use
        case 'experience':    // bonus_experience
        case 'actionPoints':  // bonus_actionPoints
        case 'spellPoints':   // bonus_spellPoints
          $value and $effects[] = ["bonus_$key", $value];
          break;
        case 'message':
          strlen($value ?? '') and $effects[] = ['bonus_message', $stackMessages ? [$this->o_append, $value] : [$this->o_const, [$value]]];
          break;
        case 'resources':   // hash int res => delta
          foreach ($value as $res => $delta) {
            if ($delta) {
              $effects[] = ['bonus_resource', $delta, 'ifResource' => $res, 'ifTargetPlayer' => -1];
            }
          }
          break;
        case 'garrison':  // hash slot => Garrison
          $unique = [];
          foreach ($value as $creature) {
            $ref = &$unique[$creature->creature];
            $ref += $creature->count;
          }
          $added = [];
          foreach ($unique as $creature => $count) {
            if ($count) {
              $effects[] = $added[] = ['bonus_creatureCount', $count, 'ifCreature' => $creature];
            }
          }
          $added and $effects[] = ['bonus_creatures', $this->o_append(array_column($added, 'ifCreature'))];
          break;
        case 'artifacts':   // array of ObjectArtifact
          $value and $effects[] = ['bonus_artifacts', $this->o_append(array_column($value, 'artifact'))];
          break;
        case 'buildings':   // array of Building->$id
          $value and $effects[] = ['bonus_buildings', $this->o_append($value)];
          break;
        case 'available':  // hash Building->$id => delta
          $added = [];
          foreach ($value as $building => $delta) {
            if ($delta) {
              $effects[] = $added[] = ['bonus_availableCount', $delta, 'ifBuilding' => $building];
            }
          }
          $added and $effects[] = ['bonus_available', $this->o_append(array_column($added, 'ifBuilding'))];
          break;

        case 'morale':
        case 'luck':
          $value and $bonus_effects[] = ["creature_$key", $value, 'ifObject' => true, 'maxCombats' => 1];
          break;
        case 'attack':
        case 'defense':
        case 'spellPower':
        case 'knowledge':
          $value and $bonus_effects[] = ["hero_$key", $value, 'ifObject' => true];
          break;
        case 'skills':   // array of H3M\Skill
          mergeInto($bonus_effects, $this->fromH3mSkills($value, ['ifObject' => true]));
          break;
        case 'skillsImprove':   // array of SoD skill index
          if ($value) {
            $skills = array_column($value, 'skill');
            $bonus_effects[] = ['hero_skills', array_merge([$this->o_prepend], $skills), 'ifObject' => true];
            foreach ($skills as $skill) {
              $bonus_effects[] = ['skillMastery', +1, 'ifSkill' => $skill, 'ifObject' => true];
            }
          }
          break;
        case 'spells':   // array of Spell->$id
          $bonus_effects[] = ['hero_spells', $this->o_append($value), 'ifObject' => true];
          break;
      }
    }

    if ($bonus_effects) {
      $effects[] = bonus_effects([$this->o_append($bonus_effects)]);
    }

    foreach ($effects as &$ref) {
      $ref += $selectors;
    }

    return $effects;
  }

  // Returns [] if $resources is null or all quantities are 0.
  protected function fromH3mResources(H3M\Resources $resources = null) {
    $res = [];

    foreach ($resources ?: [] as $resource => $delta) {
      $delta and $res[$this->const("resources.$resource")] = $delta;
    }

    return $res;
  }

  // Object convertion.

  protected function fromH3mTile(H3M\Tile $tile, $index, $z) {
    $this->fromH3mTileGeneric(
      $index, $z,
      'terrain', $this->known($tile, 'terrain', 'dirt'),
      $tile->terrainSubclass,
      $tile->terrainFlipX,
      $tile->terrainFlipY,
      1
    );

    $river = isset($tile->river) ? $this->known($tile, 'river', null) : null;

    isset($river) and $this->fromH3mTileGeneric(
      $index, $z,
      'river', $river,
      $tile->riverSubclass,
      $tile->riverFlipX,
      $tile->riverFlipY,
      2
    );

    $road = isset($tile->road) ? $this->known($tile, 'road', null) : null;

    isset($road) and $this->fromH3mTileGeneric(
      $index, $z,
      'road', $road,
      $tile->roadSubclass,
      $tile->roadFlipX,
      $tile->roadFlipY,
      3
    );

    // Ignoring $coast - it might be useful but HeroWO doesn't store it.
    // Ignoring $favorableWinds - unknown purpose.
  }

  protected function fromH3mTileGeneric($index, $z, $type, $className,
      $subclass, $flipX, $flipY, $displayOrder) {
    $class = $this->const("class.$type.$className");
    $class = $this->{$type.'ByH3'}["$class-$subclass"][0];

    return $this->newObject(null, $this->h3m->tileCoordinates($index) + [
      'z' => $z,
      'class' => $class,
      'subclass' => $subclass,    // matches Animation->$group
      'mirrorX' => $flipX,
      'mirrorY' => $flipY,
      'displayOrder' => $displayOrder,
    ]);
  }

  // $props must have 'class'.
  protected function newObject($h3mID, array $props) {
    $id = $props['id'] = count($this->builder->objects) + 1;  // 1-based ID
    $obj = $this->builder->objects[$id] = new AObject($props);
    isset($h3mID) and $this->h3mObjectIDs[$h3mID] = $obj;

    // XXX+R: clc:
    $copyProps = [
      'type', 'animation', 'duration', 'actionable',
      'texture', 'width', 'height', 'miniMap', 'passableType', 'passable',
      'actionableFromTop',
    ];

    foreach ($copyProps as $prop) {
      $value = $this->classes->atCoords($props['class'], 0, 0, $prop);
      // Not setting false values since they are normalized (null are not).
      // We don't know if false in $classes is "not provided" or exactly false,
      // but all $copyProps have null == false as for now.
      provided($value) and $obj->$prop = $value;
    }

    if (!isset($props['owner']) and
        $this->classes->atCoords($props['class'], 0, 0, 'ownable')) {
      $obj->owner = 0;  // default to neutral/unowned
    }

    // Un-compact inherited AClass properties, else AObject->normalize() will fail.
    is_string($obj->passable)   and $obj->passable   = str_split($obj->passable);
    is_string($obj->actionable) and $obj->actionable = str_split($obj->actionable);

    switch ($obj->type) {
      case $this->const('object.type.town'):
      case $this->const('object.type.dwelling'):
        $obj->available = [];   // strideX
        break;
      case $this->const('object.type.hero'):
        $obj->artifacts = [];   // strideX
        break;
    }

    if ($obj->type === $this->const('object.type.hero') and
        in_array($obj->class, $this->nameToID('objects', 'hero'))) {
      $this->heroObjects[] = $obj;
    }

    return $obj;
  }

  // May change $builder->objects' $x/$y and Map's $width/$height/$margin.
  protected function addMapMargin() {
    $map = $this->builder->map;

    // Ensure there are at least 2 cells of margin on top of the map because that's
    // where "taverned" and "prisoned" heroes are placed (see _initializePlayers(), availableHeroes).
    //
    // An alternative would be to make all such objects invisible ($displayOrder < 0) but this might not prevent things like radius-based Effects from leaking (margin doesn't prevent it either but it should be unnoticeable near map edge).
    $heroClass = $this->nameToID('objects', 'hero')[0];
    $heroWidth  = $this->classes->atCoords($heroClass, 0, 0, 'width');
    $heroHeight = $this->classes->atCoords($heroClass, 0, 0, 'height');

    // Maps can have extruding objects that SoD crops on display. HeroWO
    // doesn't crop them, instead adopting Warcraft 3's approach with
    // non-interactive map borders (margin), making the overall map larger.
    $map->margin = [
      -$this->minX,
      max(-$this->minY, $heroHeight),
      $this->maxX - $map->width + 1,
      $this->maxY - $map->height + 1,
    ];

    $map->margin[2] += max(0, $heroWidth - ($map->width + $map->margin[0] + $map->margin[2]));

    if ($map->margin[0] or $map->margin[1]) {
      foreach ($this->builder->objects as $obj) {
        if (empty($obj->prison)) {
          $obj->x += $map->margin[0];
          $obj->y += $map->margin[1];
          if ($obj->displayOrder > 3) {   // not ground
            $obj->displayOrder = $obj->displayOrder & ~(0xFF << 18) |
                                 $obj->y + $obj->height - 1 << 18;
          }
        }
      }
    }

    $map->width  += $map->margin[0] + $map->margin[2];
    $map->height += $map->margin[1] + $map->margin[3];
  }

  protected function finishH3mObjects() {
    $huts = $eyes = [];
    $monolithEntrances = $monolithExits = $gates = $whirlpools = [];
    $players = array_column($this->builder->map->players, 'player');

    foreach ($this->builder->objects as $obj) {
      if (in_array($obj->class, $this->nameToID('objects', 'hutOfMagi'))) {
        $huts[] = $obj;
      }

      if (in_array($obj->class, $this->nameToID('objects', 'eyeOfMagi'))) {
        $eyes[] = [
          'WithinCircle',
          $obj->x + 1, $obj->y + 1,   // adjust to actionable spot
          10,       // revealed radius
          $obj->z,
          null,
          $this->const('shroud.eyeOfMagi'),
          true,
        ];
      }

      if ($obj->owner) {
        // AClass'es of Databank have default $texture/$animation for "owned by
        // neutral" (unowned). Need to correct their feature list.
        //
        // Not updating $duration since in SoD all groups of AH*_ have the
        // same number of frames.
        $feature = array_search($obj->owner, $this->nameToID('players')).'Owner-';
        $this->alterStringified($obj, 3, '\0'.$feature);

        // SoD editor allows objects to be owned by players that are not in game, i.e. who have no hero/town. The game shows such objects flagged but their players are missing from Scenario Information. HeroWO doesn't allow $owner value associated with an unknown player but we still make the texture look like it belongs to that player (which is perhaps what SoD does too).
        if (!in_array($obj->owner, $players)) {
          $this->warning('owner P%d of #%d is not playable, making neutral but preserving texture', $obj->owner, $obj->id);
          $obj->owner = 0;
        }
      }

      if ($obj->type === $this->const('object.type.hero')) {
        if ($obj->garrisoned) {
          $obj->displayOrder *= -1;
        }

        if ($obj->visiting) {
          $this->alterStringified($obj, 4, '${1}'.$this->const('animation.group.visiting'));
        }
      }

      if ($obj->type === $this->const('object.type.teleport')) {
        $two = in_array($obj->class, $this->nameToID('objects', 'monolithTwoWay'));
        $group = +$two.' '.$this->classes->atCoords($obj->class, 0, 0, 'subclass');
        if ($two or in_array($obj->class, $this->nameToID('objects', 'monolithOneWayEntrance'))) {
          $monolithEntrances[$group][] = $obj;
        }
        if ($two or in_array($obj->class, $this->nameToID('objects', 'monolithOneWayExit'))) {
          $monolithExits[$group][] = $obj;
        }
        if (in_array($obj->class, $this->nameToID('objects', 'subterraneanGate'))) {
          $gates[$obj->z][] = $obj;
        }
        if (in_array($obj->class, $this->nameToID('objects', 'whirlpool'))) {
          $whirlpools[] = $obj;
        }
      }
    }

    if (!$eyes !== !$huts) {
      $this->warning("%d Eyes of the Magi present but have %d Huts",
        count($eyes), count($huts));
    } else {
      foreach ($huts as $obj) {
        $this->effect(['bonus_shroud', $this->o_append($eyes), 'ifBonusObject' => $obj->id, 'ifTargetPlayer' => -1]);
      }
    }

    foreach ($monolithEntrances as $group => $objects) {
      foreach ($objects as $obj) {
        $dest = array_values(array_diff(array_column($monolithExits[$group] ?? [], 'id'), [$obj->id]));
        $dest and $obj->destination = count($dest) === 1 ? $dest[0] : $dest;
      }
    }

    foreach ($gates as $z => $objects) {
      // On single-level maps gates are disfunctional, on others they wrap (0 -> 1 -> 0).
      $group = ($z and $z === count($gates) - 1) ? 0 : $z + 1;
      $dest = $gates[$group] ?? [];

      if ($dest) {
        $dist = [];

        // XXX=C
        foreach ($objects as $from) {
          foreach ($dest as $to) {
            $dist[] = [$from, $to, sqrt(pow($from->x - $to->x, 2) + pow($from->y - $to->y, 2))];
          }
        }

        usort($dist, function ($a, $b) { return $b[2] - $a[2]; });

        while ($top = array_pop($dist)) {
          if (!$top[0]->destination and !$top[1]->destination) {
            $top[0]->destination = $top[1]->id;
            $top[1]->destination = $top[0]->id;
          }
        }
      }
    }

    if (count($whirlpools) > 1) {
      foreach ($whirlpools as $obj) {
        $dest = array_values(array_diff(array_column($whirlpools, 'id'), [$obj->id]));
        $obj->destination = count($dest) === 1 ? $dest[0] : $dest;
      }
    }
  }

  // $value must start with '\0' to append to $i'th or with '\1' to replace.
  protected function alterStringified(AObject $obj, $i, $value) {
    foreach (['texture', 'animation'] as $prop) {
      $obj->$prop and $obj->$prop = preg_replace("/^((.*?,){"."$i})([^,]*)/", $value, $obj->$prop);
    }
  }

  protected function fromH3mObject(H3M\MapObject $h3mObject, $id) {
    $class = $this->findClassByH3M($h3mObject->class, $h3mObject->subclass,
      $h3mObject->def, $id);

    // Ignoring $index, $allowedLandscapes, $landscapeGroups, $group, $kind.

    if (!$class) { return; }    // warn 'n' scrap

    if ($h3mObject->details instanceof H3M\ObjectDetails_Town and
        is_string($h3mObject->details->type) and
        is_array($h3mObject->details->built)
          ? !array_intersect(['fort', 'capitol'], $h3mObject->details->built)
          : !$h3mObject->details->built) {
      $class = $this->towns->atCoords($h3mObject->subclass, 0, 0, 'fortlessClass');
    }

    $obj = $this->newObject($id, [
      'class' => $class,
      'z' => $h3mObject->z,
    ]);

    // Set for monsters, Event. See AClass->$adjusted.
    $adjusted = $this->classes->atCoords($class, 0, 0, 'adjusted');

    if (!$adjusted) {
      // Modded objects may have different properties in map than their
      // definitions in OBJECTS.TXT, supported by tools like h3objed. We only
      // support modded passability/actionability, and SoD itself doesn't like
      // it when others are changed.
      $obj->passable = $this->convertPassability($h3mObject->passability, 'passability', $obj, true);
      $obj->actionable = $this->convertPassability($h3mObject->actionability, 'actionability', $obj, false);
    }

    $obj->displayOrder = $this->objectDisplayOrder($obj, $h3mObject, $id);

    // Monsters are 2x2 in SoD, 3x2 in HotA, 3x3 in HeroWO (see databank.php).
    $adjusted = ($adjusted and $obj->type === $this->const('object.type.monster'));
    // Remember that $h3mObject holds coordinates of its bottom right corner.
    $this->maxX = max($this->maxX, $h3mObject->x + $adjusted);
    $this->maxY = max($this->maxY, $h3mObject->y + $adjusted);
    // We need $width/$height of AClass to calculate proper coords.
    list($obj->x, $obj->y) =
      $this->h3m->objectCoordinates($h3mObject, $obj->width - $adjusted, $obj->height - $adjusted);
    $this->minX > $obj->x and $this->minX = $obj->x;
    $this->minY > $obj->y and $this->minY = $obj->y;

    if ($h3mObject->details) {
      list($head, $tail) = explode(H3M\ObjectDetails::class.'_',
        get_class($h3mObject->details)) + ['', ''];

      if ($head === '' and method_exists($this, $func = "fromH3m_$tail")) {
        $this->$func($obj, $h3mObject->details);
      } else {
        $this->warnDetails($obj, $h3mObject->details);
      }
    }
  }

  protected function convertPassability(array $a, $prop, AObject $obj, $default) {
    $res = array_fill(0, $obj->width * $obj->height, $default);

    foreach ($a as $coords => $state) {
      list($x, $y) = explode('_', $coords);   // from bottom right corner

      if ($x < $obj->width and $y < $obj->height) {
        $x = $obj->width  - 1 - $x;
        $y = $obj->height - 1 - $y;
        $res[$x + $y * $obj->width] = $state;
      } elseif ($state !== $default) {
        $this->warning('%s set outside of object #%d, ignoring', $prop, $obj->id);
      }
    }

    return $res;
  }

  // $class/$subclass/$texture - SoD's (OBJECTS.TXT/HEROES.TXT).
  //
  // $id - related MapObject's index for debug purposes.
  protected function findClassByH3M($class, $subclass, $texture, $id = null) {
    // In databank this is in $transparentClasses, with no $texture.
    if (!$subclass and $class === 26) {
      return $this->nameToID('objects', 'event')[0];
    }

    static $compat = [
      'AVXBOAT0' => 'AB01_',
      'AVXBOAT1' => 'AB02_',
      'AVXBOAT2' => 'AB03_',

      // Some (older) maps reference DEFs that do not exist in OBJECTS.TXT.
      // For example, Ascension.h3m refers to a non-Fort random town as AVCRAND0.
      // Other examples: Dragon Orb.h3m; Good Witch, Bad Witch.h3m.
      //
      // XXX+R This should be generally addressed by parsing RoE's and AB's
      // OBJECTS.TXT and creating a compatibility list rather than hardcoding an array here.
      'AVCRAND0' => 'AVCRANX0',
      'AVCCAST0' => 'AVCCASX0',
      'AVCDUNG0' => 'AVCDUNX0',
      'AVCFTRT0' => 'AVCFTRX0',
      'AVCINFT0' => 'AVCINFX0',
      'AVCNECR0' => 'AVCNECX0',
      'AVCRAMP0' => 'AVCRAMX0',
      'AVCSTRO0' => 'AVCSTRX0',
      'AVCTOWR0' => 'AVCTOWX0',
    ];

    $classTexture = preg_replace('/\.DEF$|(_)E/', '\1', strtoupper($texture));
    $classTexture = $compat[$classTexture] ?? $classTexture;
    $classTexture = 'Hh3-def_frame_,'.$classTexture.',';
    $res = null;

    // One notable example when lookup by class/subclass legitly fails is
    // "Titans Winter.h3m" which has a Market of Time, never implemented in HoMM 3.
    foreach ($this->objectByH3["$class-$subclass"] ?? [] as $herowoClass) {
      if (!strncmp($this->classes->atCoords($herowoClass, 0, 0, 'texture'), $classTexture, strlen($classTexture))) {
        if (isset($res)) {
          // Not $important - this is usually harmless because the only
          // differences between same (official) OBJECTS.TXT entries is in
          // $supportedTerrain/$editorTerrain (see AVMwndd0, for example).
          $this->warning(
            false,
            'multiple AClass->$id candidates for #%s, using the first one (%d): %d/%d/%s',
            $id,
            $res,
            $class, $subclass, $texture);
          break;
        }

        $res = $herowoClass;
      }
    }

    if (!isset($res)) {
      $this->warning("cannot find AClass for #%s matching %s/%s/%s, ignoring object",
        $id, $class, $subclass, $texture);
    }

    return $res;
  }

  protected function objectDisplayOrder(AObject $obj, H3M\MapObject $object, $h3mID) {
    // XXX++C If SoD uses a universal algorithm for all objects then for the life of me I cannot figure it out. It seems there are either exceptions for hardcoded object classes (notably mountains and trees) or final order depends on individual passability bits. It's easy to spot by comparing against the upper level of "Adventures of Jared Haret" - if you change this calculation, some objects become correctly positioned while others break. For now, this formula at least makes (most) maps playable.
    //
    // 26      18        17          16 2               0
    // 1       11111111b 1           0  11111111111111b 00
    // !ground y         actionable  *  h3mID           zero
    // (*) set for objects moved on run-time; h3mID then specifies X (H3.Rules)
    //
    // If changing this calculation, update addMapMargin() and copies of this in JS (XXX+R: dor:).
    return !$object->ground << 26 |
           // Up to map height of 255.
           $object->y + $this->builder->map->margin[1] << 18 |
           (bool) array_filter($object->actionability) << 17 |
           // Reserve 0-3 for terrain/river/road set by fromH3mTileGeneric().
           $h3mID << 2;
  }

  protected function warnDetails(AObject $obj, $details = null) {
    $this->warning("unsupported %s of %s #%d",
      $details ? get_class($details) : 'missing $details',
      $obj::type[$obj->type],
      $obj->id);
  }

  // $artifacts is a hash of 'slot' => H3M\Artifact|array thereof for 'backpack'.
  // Returns [] if empty.
  protected function fromH3mEquippedArtifacts(array $artifacts) {
    $res = [];

    // XXX=RH slot
    $res[$this->nameToID('artifactSlots', 'warMachine4')] = new ObjectArtifact([
      'artifact' => $this->nameToID('artifacts', 'catapult'),
    ]);

    foreach ($artifacts as $slot => $artifact) {
      $artifacts = $slot === 'backpack' ? $artifact : [$artifact];
      $slot = $this->nameToID('artifactSlots', $slot);
      foreach ($this->fromH3mArtifacts($artifacts) as $artifact) {
        $res[$slot++] = $artifact;
      }
    }

    return $res;
  }

  // $artifacts = array of H3M\Artifact.
  // Returns [] if empty.
  protected function fromH3mArtifacts(array $artifacts) {
    return array_map(function (H3M\Artifact $art) {
      // $art->artifact matches Artifact->$id.
      return new ObjectArtifact(H3M\publicProperties($art));
    }, $artifacts);
  }

  // $artifacts = array of H3M\Skill-like object.
  // Returns [] if empty.
  protected function fromH3mSkills(array $skills, array $selectors = []) {
    // Matches Skill->$id.
    $effects = [['hero_skills', array_merge([$this->o_prepend], array_column($skills, 'skill'))] + $selectors];

    foreach ($skills as $skill) {
      $effects[] = [
        'skillMastery',
        [$this->o_clamp, $this->const('skill.mastery.'.$this->known($skill, 'level', 'basic'))],
        'ifSkill' => $skill->skill,
      ] + $selectors;
    }

    return $skills ? $effects : [];
  }

  // $creatures = array or Hash instance.
  // Returns null if $creatures is null, [] if it's empty.
  protected function fromH3mCreatures($creatures = null) {
    if ($creatures) {
      is_array($creatures) or $creatures = H3M\publicProperties($creatures);

      return array_map(function (H3M\Creature $creature) {
        // $creature->creature matches Creature->$id.
        return new Garrison(H3M\publicProperties($creature));
      }, $creatures);
    }
  }

  // Object details convertion.

  protected function fromH3m_HeroPlaceholder(AObject $obj, H3M\ObjectDetails $details) {
    $obj->owner = $this->nameToID('players', $this->known($details, 'owner'));

    if (isset($details->hero)) {
      // Matches Hero->$id.
      $obj->subclass = $details->hero;
    } else {
      $obj->powerRating = $details->powerRating;
    }
  }

  protected function fromH3m_QuestGuard(AObject $obj, H3M\ObjectDetails $details, array $options = []) {
    if (func_num_args() < 3 and
        !in_array($obj->class, $this->nameToID('objects', 'questGuard'))) {
      return $this->warnDetails($obj, $details);
    }

    $options += [
      // As per SoD behaviour, there are groups of messages (quest ::class => array of messages), each group having exactly one message in the following 3 arrays. Groups are identified by their index in these arrays. This means all 3 arrays should have sub-arrays with the same length across all main arrays.
      //
      // On run-time, for every new game H3.Rules picks a random group (index) and assigns messages from the same group out of these arrays. In other words, messages are picked in relation to each other.
      'quest' => static::$questGuardQuest,
      'progress' => static::$questGuardProgress,
      'complete' => static::$questGuardComplete,
      // Seer's Hut shows deadline message if no quest was assigned. Quest Guard simply does nothing.
      'deadlineIfNoQuest' => false,
      'audio' => '',
    ];

    $selectors = ['ifBonusObject' => $obj->id];

    if (!$details->quest and !$options['deadlineIfNoQuest']) {
      $this->effect(['quest_message', [$this->o_const, []], 'stack' => [$this->const('effect.stack.quest'), 1]] + $selectors);
    }

    if (!$details->quest or $details->deadline === 0) {
      $this->effect(['quest_fulfilled', $this->o_false] + $selectors);
      $msg = $details->quest
        ? "%s with impossible deadline"
        // Editor allows this but such an object doesn't respond to player
        // interaction in game.
        : "%s with undefined quest (non-interactive)";
      return $this->warning($msg, get_class($details));
    }

    if (isset($details->deadline)) {
      $this->effect(['quest_fulfilled', $this->o_false, 'ifDateMin' => $details->deadline] + $selectors);
      $selectors += ['ifDateMax' => $details->deadline - 1];
    }

    $format = function ($user, array $messages) use ($obj, $details) {
      if (!isset($user)) {
        // Like with fromH3m_Artifact()'s $proposal, it's easier to determine the type of standard message when we have all data laid out.
        $user = $messages[get_class($details->quest)];

        foreach ($user as &$ref) {
          switch (get_class($details->quest)) {
            case H3M\Quest_BeHero::class:
              $ref = sprintf($ref, $details->quest->hero);
              break;

            case H3M\Quest_BePlayer::class:
              $ref = sprintf($ref, $details->quest->player);
              break;
          }
        }
      }

      return $user;
    };

    $formatChecks = function ($user, array $messages) use ($details, $format, $options) {
      $formatted = (array) $format($user, $messages);

      foreach ($formatted as &$ref) {
        if (isset($details->deadline) and
            // SoD shows no deadline info for the resource-type quest.
            get_class($details->quest) !== H3M\Quest_Resources::class) {
          // SEERHUT.TXT[47]
          $ref .= ' '.sprintf('You must return in %d days.', $details->deadline - 1);
        }

        $ref .= "\n\n`{ChecksImages`}";
        $options['audio'] and $ref .= "`{Audio $options[audio]`}";
      }

      return is_array($user) ? $formatted : $formatted[0];
    };

    $obj->message = $formatChecks($details->firstMessage, $options['quest']);
    $obj->progress = $formatChecks($details->unmetMessage, $options['progress']);
    // No audio in this message.
    $obj->completion = $format($details->metMessage, $options['complete']);

    $checks = $bonuses = [];

    switch (get_class($details->quest)) {
      case H3M\Quest_Level::class:
        $checks[] = [$this->o_check, 'level', $details->quest->level - 1];
        break;
      case H3M\Quest_PrimarySkills::class:
        foreach ($this->stats as $prop) {
          if ($details->quest->$prop) {
            $checks[] = [$this->o_check, $prop, $details->quest->$prop];
          }
        }
        break;
      case H3M\Quest_DefeatHero::class:
      case H3M\Quest_DefeatMonster::class:
        $checks[] = [$this->o_check, 'defeat', &$refDefeat];
        $this->resolveH3mObjectIDs[] = [null, &$refDefeat, $details->quest->object];
        // Ignoring $objectID, resolving using $object.
        break;
      case H3M\Quest_Resources::class:
        foreach ($details->quest->resources as $name => $value) {
          if ($value) {
            $checks[] = [$this->o_check, "resources_$name", $value];
            $bonuses['resources'][$this->const("resources.$name")] = -$value;
          }
        }
        break;
      case H3M\Quest_BeHero::class:
      case H3M\Quest_BePlayer::class:
        // [$check, false] is similar to [$const, false] but the latter doesn't
        // create entry in questChecks, which trips our quest_message set-up.
        $checks[] = ['modifier' => [$this->o_check, false], 'stack' => $this->const('effect.stack.quest')];
        $checks[] = [
          'modifier' => [$this->o_check],
          // Matches Hero->$id.
          'ifHero' => $details->quest->hero ?? null,
          'ifPlayer' => isset($details->quest->player) ? $this->nameToID('players', $details->quest->player) : null,
          'stack' => [$this->const('effect.stack.quest'), 1],
        ];
        break;
      case H3M\Quest_Creatures::class:
        foreach ($details->quest->creatures as $creature) {
          if ($creature->count) {
            // Matches Creature->$id.
            $checks[] = [$this->o_check, 'garrison', $creature->creature, $creature->count];
          }
        }
        break;
      case H3M\Quest_Artifacts::class:
        foreach ($details->quest->artifacts as $artifact) {
          // Matches Artifact->$id.
          $checks[] = [$this->o_check, 'artifact', $artifact->artifact];
        }
        break;
      default:
        $this->warnDetails($obj, $details->quest);
    }

    foreach ($checks as $check) {
      isset($check['modifier']) or $check = [1 => $check];
      $this->effect(['quest_fulfilled'] + $check + $selectors);
    }

    $this->effects($this->bonusEffects($bonuses, $selectors));
  }

  protected function fromH3m_PandoraBox(AObject $obj, H3M\ObjectDetails $details) {
    $event = $details instanceof H3M\ObjectDetails_Event;
    $obj->message = $this->fromH3mGuarded($obj, $details);

    if ($obj->message and !$event) {
      $obj->message .= '`{Audio MYSTERY`}';
    }

    $effects = [
      'experience'  => $details->experience,
      'spellPoints' => $details->spellPoints,
      'morale'      => $details->morale,
      'luck'        => $details->luck,
      'resources'   => $this->fromH3mResources($details->resources),
      'skills'      => $details->skills,
      'artifacts'   => $this->fromH3mArtifacts($details->artifacts ?: []),
      // XXX=R:hhsi:
      'spells'      => $details->spells,
      'garrison'    => $this->fromH3mCreatures($details->creatures) ?: [],
    ];

    $effects += array_intersect_key((array) $details, array_flip($this->stats));

    $selectors = [
      'ifBonusObject' => $obj->id,
      'ifPlayerController' => $event
        ? $this->playerController(true, $details->applyToComputer) : null,
    ];

    $effects = $this->bonusEffects($effects, $selectors);

    if ($event and $details->removeAfterVisit) {
      $effects[] = ['quest_remove', true] + $selectors;
      $effects[] = ['quest_removeAudio', ''] + $selectors;
    }

    if (!$event or !array_diff(array_keys($this->h3m->players), $details->players)) {
      $this->effects($effects);
    } else {
      foreach ($effects as $effect) {
        foreach ($details->players as $player) {
          $effect['ifPlayer'] = $this->nameToID('players', $player);
          $this->effect($effect);
        }
      }
    }
  }

  protected function fromH3mGuarded(AObject $obj, H3M\ObjectDetails $details) {
    $obj->garrison = $this->fromH3mCreatures($details->guard->creatures ?? null);
    if ($obj->garrison) {
      $obj->initialized[$this->const('object.initialized.garrison')] = true;
    }
    return $details->guard->message ?? null;
  }

  protected function fromH3mGuardedPrompt(AObject $obj, H3M\ObjectDetails $details) {
    $message = $this->fromH3mGuarded($obj, $details);

    // $message is a prompt if there are guardians and a prompt-time message if not.
    if ($message) {
      if ($obj->garrison) {
        // SpellScroll/Resource have no audio in this message. Artifact does (added by fromH3m_Artifact()).
        $obj->proposal = $message;
      } else {
        // Has the usual PICKUP0# audio.
        $message = "$message\n\n`{BonusesImages`}";
        $this->effects($this->bonusEffects(compact('message'), $obj->id));
      }
    }
  }

  protected function fromH3m_Event(AObject $obj, H3M\ObjectDetails $details) {
    if (!($details->applyToHuman ?? true)) {
      $this->warning('unsupported HotA %s value of %s #%d, ignoring',
        '$applyToHuman', get_class($details), $obj->id);
    }

    $this->fromH3m_PandoraBox(...func_get_args());
  }

  protected function fromH3m_Sign(AObject $obj, H3M\ObjectDetails $details) {
    $this->effects($this->bonusEffects(['message' => $details->message.'`{Audio XXX=ID`}'], $obj->id));
  }

  protected function fromH3m_Garrison(AObject $obj, H3M\ObjectDetails $details) {
    $this->fromH3m_Ownable($obj, $details);
    $obj->garrison = $this->fromH3mCreatures($details->creatures);
    $obj->formation = $this->const('object.formation.spread');

    if (!$details->canTake) {
      $this->effect(['garrison_reduce', $this->o_false, 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
    }
  }

  protected function fromH3m_Grail(AObject $obj, H3M\ObjectDetails $details) {
    $obj->displayOrder *= -1;

    if ($details->radius) {
      // SoD allows one Grail object on map, with optional radius randomizing its placement in every new game. HeroWO takes a different approach: it allows any number of Grails and removes all but the random one when the game starts. This enables potential Grail spots to be anywhere on the map.
      //
      // To facilitate this, we create a Grail object in every $radius spot except the Grail's own spot (where the object already exists). This may result in high number of new objects but I assume maps don't use large $radius.
      //
      // If there is no Grail object, H3.Rules will place a Grail anywhere on the map provided there is at least one Obelisk object.
      //
      // The editor's help says radius creates a "circular" region, not
      // square. For example, given the radius of 2:
      //
      //   [ ][ ][?][ ][ ]
      //   [ ][?][?][?][ ]
      //   [?][?][G][?][?]
      //   [ ][?][?][?][ ]
      //   [ ][ ][?][ ][ ]
      //
      // XXX+IC compare the shape of our circle with the algorithm SoD uses
      //
      // circle() relies on the fact map margin wasn't yet added so comparing
      // with 0 and width/height compares with the playable area. We
      // don't want to place Grail inside margin, where players cannot
      // reach it.
      //
      // "+ 1" is for [ ][X] - Grail MapObject's actionable spot.
      $coords = circle($obj->x + 1, $obj->y, $details->radius,
        $this->builder->map->width - 1, $this->builder->map->height - 1);

      foreach ($coords as [$x, $y, $dx, $dy]) {
        if ($dx or $dy) {   // already exists in the center
          // Copy properties from $obj verbatim bypassing newObject() which
          // may change some of them.
          $id = count($this->builder->objects) + 1;
          $this->builder->objects[] = new AObject(compact('id', 'x', 'y') + (array) $obj);
        }
      }
    }
  }

  protected function fromH3m_Ownable(AObject $obj, H3M\ObjectDetails $details) {
    if (isset($details->owner)) {
      $owner = $this->known($details, 'owner', null);
      $owner and $obj->owner = $this->nameToID('players', $owner);
    }

    if (isset($details->resource)) {
      $obj->subclass = $this->const('resources.'.$this->known($details, 'resource'));
    }
  }

  protected function fromH3m_AbandonedMine(AObject $obj, H3M\ObjectDetails $details) {
    $resources = [];

    foreach ($details->potentialResources as $res) {
      $res = $this->knownValue('potentialResources', $res, null);
      if ($res) {
        // Labeled Effects defined in databank-objects.php.
        $resources[$res === 'gems' ? 'abandJ' : 'aband'.strtoupper($res[0])] = 1;
      }
    }

    if ($resources) {
      $this->effect(['quest_chances', [$this->o_const, $resources], 'ifBonusObject' => $obj->id]);
    }
    // Else - all $potentialResources are unknown, fall back to any resource as defined by default for this object class.
  }

  protected function fromH3m_Town(AObject $obj, H3M\ObjectDetails $details) {
    if ($details->spellResearch ?? false) {
      $this->warning('unsupported HotA %s value of %s #%d, ignoring',
        '$spellResearch', get_class($details), $obj->id);
    }

    if (isset($details->type)) {
      $obj->subclass = $this->nameToID('towns', $details->type);
    }   // else null - random town

    $this->fromH3mTownHeroDetails($obj, $details);
    $this->fromH3mTownBuildings($obj, $details);

    foreach ($details->events as $h3mEvent) {
      $this->fromH3mTownEvent($obj, $h3mEvent);
    }

    // Buildings are not disabled recursively. If anything in game (e.g. a timed event) erects a disabled building, buildings requiring it can be then constructed.
    foreach ($this->fromH3mBuildings($obj, $details->disabledBuildings) as $building) {
      $this->effect(['town_canBuild', $this->o_false, 'ifBuilding' => $building, 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
    }

    if ($details->existingSpells) {
      // XXX=R:hhsi:
      $this->effect(['town_spells', $this->o_append($details->existingSpells), 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
    }

    foreach ($details->impossibleSpells as $spell) {
      // XXX=R:hhsi:
      $this->effect(['town_spellChance', $this->o_clamp00, 'ifSpell' => $spell, 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
    }

    $type = isset($details->randomType)
      ? $this->known($details, 'randomType', null) : null;
    isset($type) and $obj->randomTypeOf = $this->nameToID('players', $type);

    if (isset($details->visiting)) {
      $this->resolveH3mObjectIDs[] = [$obj, 'visiting', $details->visiting];
    }

    // Ignoring $objectID.
    //
    // Not setting $listOrder - it depends on towns chosen when starting game.
  }

  protected function fromH3mTownHeroDetails(AObject $obj,
      H3M\ObjectDetails $details) {
    $this->fromH3m_Ownable($obj, $details);

    if (isset($details->name)) {
      $this->effect(['name', $details->name, 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
      $obj->initialized[$this->const('object.initialized.name')] = true;
    }

    $obj->garrison = $this->fromH3mCreatures($details->creatures);

    $obj->formation = $this->const('object.formation.'.$this->known($details, 'formation', 'spread'));
  }

  protected function fromH3mTownEvent(AObject $obj, H3M\TownEvent $h3mEvent) {
    $bonuses = [
      'buildings' => $this->fromH3mBuildings($obj, $h3mEvent->build),
    ];

    foreach ($h3mEvent->growth as $level => $delta) {
      $found = count($bonuses['available'] ?? []);

      $producers = isset($obj->subclass)
        ? $this->producers[$obj->subclass]
        : array_replace(...$this->producers);

      foreach ($producers as $building => $creatures) {
        foreach ($creatures as $creature) {
          if ($this->creatures->atCoords($creature, 0, 0, 'level') === $level + 1) {
            $bonuses['available'][$building] = $delta;
            break;
          }
        }
      }

      if ($found === count($bonuses['available'])) {
        $this->warning("no producer buildings for creatures of level %d in town object #%d, type %s",
          $level + 1,
          $obj->id,
          isset($obj->subclass) ? $obj->subclass : 'random');
      }
    }

    $this->fromH3mEvent($h3mEvent, $bonuses, ['ifObject' => $obj->id]);
  }

  protected function fromH3mTownBuildings(AObject $obj,
      H3M\ObjectDetails_Town $details) {
    $random = !isset($obj->subclass);
    $buildings = [];

    if (is_array($details->built)) {
      mergeInto($buildings, $this->fromH3mBuildings($obj, $details->built));

      if (!array_intersect($buildings, $this->hallBuildings)) {
        $buildings[] = $this->nameToID('buildings', 'hall');
      }
    } else {
      $buildings[] = $this->nameToID('buildings', 'hall');
      $buildings[] = $this->nameToID('buildings', 'tavern');

      if ($details->built) {    // "Has Fort"
        $buildings[] = $this->nameToID('buildings', 'fort');

        $extra = [
          'castle'      => ['guardhouse'],
          'rampart'     => ['centaurStables'],
          'tower'       => ['workshop'],
          'inferno'     => ['impCrucible'],
          'necropolis'  => ['cursedTemple'],
          'dungeon'     => ['warren'],
          'stronghold'  => ['goblinBarracks', 'wolfPen'],
          'fortress'    => ['gnollHut'],
          'conflux'     => ['magicLantern'],
        ];

        if ($random) {
          $extra = array_merge(...array_values($extra));
        } else {
          $extra = $extra[array_search($obj->subclass, $this->nameToID('towns'))];
        }

        foreach ($extra as $building) {
          $buildings[] = $this->nameToID('buildings', $building);
        }
      }
    }

    // For regular town, record initial buildings as erected. For random town,
    // delay this until the game has started, when the town's type becomes known.
    if ($random) {
      $this->effects($this->bonusEffects(compact('buildings'), [
        'ifObject' => $obj->id,
        'ifBonusObject' => 0,
        'source' => $this->const('effect.source.initialize'),
        'ifDateMax' => 0,
      ]));
    } else {
      $this->effect([
        'town_buildings',
        $this->o_append($buildings),
        'ifObject' => $obj->id,
        'source' => $this->const('effect.source.initialize'),
      ]);
    }

    // XXX=I Must remove Lighthouse and Shipyard if the town is not near water (SoD allows them but factually ignores "Built" state for these two in Town Properties). XXX=C However, this likely has to be done on the JS side because this has to apply to Timed Event buildings as well.

    $obj->initialized[$this->const('object.initialized.buildings')] = true;
  }

  protected function fromH3mBuildings(AObject $obj, array $buildings) {
    // This is represented by a bitfield in .h3m, each bit corresponding to
    // multiple potential buildings but from different town types, i.e. that
    // cannot be erected together. Need to map them to actual Building->$id-s.
    $res = [];

    foreach ($buildings as $bit => $building) {
      $names = $this->knownValue('built', $building, null);

      if ($names === 'horde4') {
        // SoD has no buildings that boost growth of 4th level creatures so
        // building or disabling it in the editor does essentially nothing.
      } elseif (isset($names)) {
        // Remove generic building names found in random town's configuration,
        // as long as they are accompanied by town-specific names.
        $names = preg_replace('/^(horde\d|dwelling\dU?) /', '', $names);
        $potential = $this->filterBuildingsByTown($obj->subclass, $names);

        if (!$potential) {
          // Most likely a bug in HeroWO or h3m2json.php.
          $this->warning('no matching HeroWO buildings for $built bit %d of Town #%d: %s, ignoring',
            $bit, $obj->id, $names);
        } elseif (!isset($obj->subclass)) {
          mergeInto($res, $potential);
        } else {
          if (count($potential) > 1) {
            // Most likely a bug in HeroWO or h3m2json.php.
            $this->warning('H3M specifies multiple potential buildings per one $built bit %d of Town #%d, using the first one: %s; %s',
              $bit, $obj->id, $names, join(' ', $potential));
          }

          $res[] = $potential[0];
        }
      }
    }

    // Town->$built and TownEvent->$build include unupgraded forms. The former goes straight to town_buildings (except for Random town) which should not include inferior buildings. The latter we could ignore since H3.Rules takes care of removing them when applying event effects, but we filter the list anyway to slightly improve the run-time performance. Not filtering if town is random since we don't know which buildings will be erected and therefore which buildings are unupgraded.
    if (isset($obj->subclass)) {
      $upgraded = [];

      foreach ($res as $id) {
        mergeInto($upgraded, $this->buildings->atCoords($id, 0, 0, 'upgrade') ?: []);
      }

      $res = array_filter($res, function ($id) use ($upgraded) {
        return !in_array($id, $upgraded);
      });
    }

    return $res;
  }

  // If $class is null returns buildings erectable by any town type.
  protected function filterBuildingsByTown($class, $names) {
    $res = [];

    foreach (explode(' ', $names) as $name) {
      $id = $this->nameToID('buildings', $name, null);

      if (isset($id)) {
        $towns = $this->buildings->atCoords($id, 0, 0, 'town');

        if (is_array($towns)
              ? $class === null or in_array($class, $towns)
              : !$towns) {
          $res[] = $id;
        }
      }
    }

    return $res;
  }

  protected function fromH3m_RandomDwelling(AObject $obj, H3M\ObjectDetails $details) {
    $this->fromH3m_Ownable($obj, $details);

    $towns = $details->towns;

    // If assigning type by a town and that town is not random, resolve the type
    // immediately rather than on run-time.
    if (!isset($towns)) {   // fully random or by town type, both by reference
      $town = $this->h3m->objects[$details->object]->details;

      if ($town->type === null) {
        $this->resolveH3mObjectIDs[] = [$obj, 'randomTypeOf', $details->object];
      } elseif ($type = $this->known($town, 'type')) {
        // This should be unreachable because the official editor displays only
        // random towns in the "Same as" list.
        $towns = [$type];
      }
    } else {
      $towns = array_values(array_intersect_key($this->nameToID('towns'), array_flip($towns)));
    }

    $obj->randomTypes = [];

    foreach ($this->dwellings as $class => $creatures) {
      foreach ($creatures ?: [] as $creature) {
        $level = $this->creatures->atCoords($creature, 0, 0, 'level') - 1;
        $town  = $this->creatures->atCoords($creature, 0, 0, 'town');

        if ((!isset($details->minLevel) or $details->minLevel <= $level) and
            (!isset($details->maxLevel) or $details->maxLevel >= $level) and
            // Matches Town->$id.
            (!isset($towns) or in_array($town, $towns))) {
          $obj->randomTypes[] = $class;
          break;
        }
      }
    }

    // Ignoring $objectID, resolving using $object.
  }

  protected function fromH3m_Hero(AObject $obj, H3M\ObjectDetails $details) {
    if (!$details->owner) {
      // Create a new regular hero object for Prison, owned by neutral and placed off-map.
      $prison = $obj;

      $obj = $this->newObject(null, [
        // Matches Hero->$id.
        'class' => $this->nameToID('objects', 'hero_'.$this->heroes->atCoords($details->type, 0, 0, 'class'))[0],
        // The hero object could be kept in the same spot as Prison but invisible ($displayOrder < 0) but this won't disable its Effects (including radius-based ones). There are no such Effects in SoD but tucking it away for reliability.
        'x' => 0,
        'y' => 0,
        'z' => 0,
      ]);

      $obj->prison = true;    // exempt from margin
      $prison->subclass = $obj->id;
    }

    // Matches Hero->$id.
    $obj->subclass = $details->type;

    if (isset($details->visiting)) {
      // Align hero's actionable spot with the town's.
      //
      // SoD places visiting hero in the same spot as the town. Given its
      // coordinate system, after converting coords to top left the hero's coords
      // no longer match the town's:
      //
      //   [.‡[.][.][.][.][.]   . town's box (6*6)
      //   [.][.][.][.][.][.]   T town's impassable cells
      //   [.][.][.][.][.][.]   # town's actionable spot
      //   [.][.][T][T][T][.]   * cells taken by town and hero (3*2)
      //   [.][T][T][*¹[*][*]   † town's and hero's coordinates (in SoD)
      //   [.][T][T][#²[*][*†   ‡ town's coordinates (in HeroWO)
      //                        ¹²hero's coords before¹/after² correction
      $obj->x--;
    }

    $this->fromH3mTownHeroDetails($obj, $details);

    if ($obj->garrison) {
      $obj->initialized[$this->const('object.initialized.garrison')] = true;
    }

    if (isset($details->experience)) {
      $this->fromH3mHeroExperience($obj, $details->experience);
      $obj->initialized[$this->const('object.initialized.experience')] = true;
    }

    if (isset($details->face)) {
      // $face matches Hero->$id.
      $this->effect(['portrait', $this->heroes->atCoords($details->face, 0, 0, 'portrait'), 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
      $obj->initialized[$this->const('object.initialized.portrait')] = true;
    }

    // Because the editor allows replacing hero identity's skills for a particular object on map, we have to supersede Hero->$skills. Most straightforward way would be an ad-hoc HeroClass (see fromH3mCustomHero()) but a better way is only superseding Effects provided by Hero->$skills, and there are 1+N of them: hero_skills (1) and skillMastery (N). Since we don't know which skills the hero is meant to have according to its HeroClass, we append an Effect without the $ifSkills selector with [$delta, 0] which essentially keeps the value calculated so far but cancels other Effects with lower $stack.
    //
    // Hero->$spells are overridden in the same way except it only consists of one hero_spells Effect.
    if (isset($details->skills)) {
      $selectors = ['ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize'), 'stack' => [array_search('classStats', H3Effect::stack), 1]];
      $this->effect(['skillMastery', 0] + $selectors);
      $selectors['stack'][1]++;
      // If the overridden class has any skills, it will cancel the base
      // hero_skills thanks to $stack, else we create a dummy Effect prepend'ing
      // nothing (though a skill-less hero is not normal).
      if ($details->skills) {
        $this->effects($this->fromH3mSkills($details->skills, $selectors));
      } else {
        $this->effect(['hero_skills', [$this->o_prepend]] + $selectors);
      }
    }

    if (isset($details->artifacts)) {
      $obj->artifacts = $this->fromH3mEquippedArtifacts($details->artifacts);
      $obj->initialized[$this->const('object.initialized.artifacts')] = true;
    }

    if (isset($details->patrolRadius)) {
      $obj->patrol = [$obj->x, $obj->y, $obj->z, $details->patrolRadius];
    }

    if (isset($details->biography)) {
      $this->effect(['hero_biography', $details->biography, 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
      $obj->initialized[$this->const('object.initialized.biography')] = true;
    }

    if (isset($details->gender)) {
      $this->effect(['hero_gender', -1.0 * $this->const('hero.gender.'.$this->known($details, 'gender', 'male')), 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
      $obj->initialized[$this->const('object.initialized.gender')] = true;
    }

    if (isset($details->spells)) {
      if ($details->spells) {
        // XXX=R:hhsi:
        $this->effect(['hero_spells', $this->o_append($details->spells), 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize'), 'stack' => [array_search('classStats', H3Effect::stack), 1]]);
      }
    }

    if (isset($details->attack)) {
      foreach ($this->stats as $prop) {
        $this->effect(["hero_$prop", -1.0 * $details->$prop, 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
      }
      $obj->initialized[$this->const('object.initialized.stats')] = true;
    }

    $obj->tactics = true;   // SoD default

    // Heroes on all standard SoD maps start on land.
    $obj->vehicle = $this->const('object.vehicle.horse');

    // Ignoring $objectID.
    //
    // Not setting $listOrder - it depends on heroes chosen when starting game.
  }

  // XXX=R duplicates with JS code
  //
  // Determines hero level by the number of experience points.
  protected function fromH3mHeroExperience(AObject $obj, $experience) {
    $obj->experience = $experience;
    $obj->level = 0;
    $levelUps = $this->const('levelUps');

    foreach ($levelUps as $i => $exp) {
      if ($i < count($levelUps) - 1) {
        if ($experience < $exp) { break; }
        $obj->level++;
      } else {
        $mul = $exp;
        $exp = $levelUps[$i - 1];

        while (true) {
          $exp *= $mul;
          if ($experience < floor($exp)) { break; }
          $obj->level++;
        }
      }
    }
  }

  protected function fromH3m_Monster(AObject $obj, H3M\ObjectDetails $details) {
    if (isset($details->exactAggression) or isset($details->joinOnlyForMoney) or
        isset($details->joinPercentage) or isset($details->upgradedStack) or
        isset($details->splitStack)) {
      $this->warning('unsupported HotA feature(s) of %s #%d, ignoring',
        get_class($details), $obj->id);
    }

    if (isset($details->creature)) {
      // Matches Creature->$id.
      $obj->subclass = $details->creature;
    } elseif (isset($details->level)) {
      $obj->randomLevel = $details->level + 1;
    }

    if ($details->count) {
      $obj->garrison[] = new Garrison([
        'creature' => $obj->subclass,
        'count' => $details->count,
      ]);
      $obj->initialized[$this->const('object.initialized.garrison')] = true;
    }

    $disp = $this->known($details, 'disposition', 'aggressive');
    if ($disp !== 'aggressive') {
      // Determined empirically.
      //
      // XXX=C is it purely random or depends on other factors? like hero's army strength
      $chance = ['compliant' => 1.0, 'friendly' => 0.7, 'hostile' => 0.3, 'savage' => 0.0][$disp];
      $this->effect(['creature_join', (int) ($chance * $this->const('effect.multiplier')), 'ifObject' => $obj->id, 'source' => $this->const('effect.source.initialize')]);
    }

    // No audio in this message.
    $obj->message = $details->message;

    if (isset($details->resources) or isset($details->artifact)) {
      $effects = [
        'resources' => $this->fromH3mResources($details->resources),
        'artifacts' => !isset($details->artifact) ? [] :
          // Matches Artifact->$id.
          [new ObjectArtifact(['artifact' => $details->artifact])],
      ];

      $this->effects($this->bonusEffects($effects, $obj->id));
    }

    if (!$details->canFlee) {
      // XXX=I:mof:
      //$this->effect(['retreatCan', $this->o_false, 'ifObject' => $obj->id]);
    }

    if (!$details->canGrow) {
      $this->effect(['grows', $this->o_false, 'ifObject' => $obj->id]);
    }

    // Ignoring $objectID.
  }

  protected function fromH3m_Artifact(AObject $obj, H3M\ObjectDetails $details) {
    $this->fromH3mGuardedPrompt($obj, $details);

    // It's easier to set up messages here while we have already structured data than on run-time where we'd have to account for various combinations of Effects and object properties.
    if ($obj->garrison) {
      if ($obj->proposal === null) {
        $guards = [];

        foreach ($obj->garrison as $cr) {
          $guards[$cr->creature] = ($guards[$cr->creature] ?? 0) + $cr->count;
        }

        $creatures = array_keys($guards);

        foreach ($guards as $cr => &$ref) {
          $name = $this->creatures->atCoords($cr, 0, 0, $ref === 1 ? 'nameSingular' : 'namePlural');
          // XXX count should depend on garrisonSee and could be a word: "few", "several", etc.
          $ref = "$ref $name";
          // XXX=R duplicates with `{Checks`}
          if ($cr !== $creatures[count($creatures) - 1]) {
            $ref .= $cr === $creatures[count($creatures) - 2] ? ' and ' : ', ';
          }
        }

        $name = count($guards) === 1 ? $name : 'creatures';
        // GENRLTXT.TXT[421]
        $obj->proposal = "`## Artifact\n\n".
          sprintf("Through a clearing you observe an ancient artifact.  Unfortunately, it's guarded by %s.  Do you want to fight the %s for the artifact?", join($guards), $name);
      }

      $obj->proposal .= '`{Audio TREASURE`}';

      $this->effects($this->bonusEffects([
        // ADVEVENT.TXT[8]
        // No audio in this message.
        'message' => "Victorious, you take your prize, `{Bonuses`}.\n\n`{BonusesImages`}",
      ], $obj->id));
    }

    if ($details->artifact !== null) {
      $effects = [
        // Matches Artifact->$id.
        'artifacts' => [new ObjectArtifact(['artifact' => $details->artifact])],
      ];

      $this->effects($this->bonusEffects($effects, $obj->id));
    }
  }

  protected function fromH3m_Shrine(AObject $obj, H3M\ObjectDetails $details) {
    // XXX=R:hhsi:
    if (isset($details->spell)) {
      // Override default ifBonusObjectClass' quest_chances.
      // 's_$' labels are defined in databank-objects.php.
      $this->effect(['quest_chances', [$this->o_const, [preg_replace('/^/', 's_', $details->spell) => 1]], 'ifBonusObject' => $obj->id]);
    }

    // Ignoring $level - databank-objects.php selects appropriate spells based
    // on class.
  }

  protected function fromH3m_SpellScroll(AObject $obj, H3M\ObjectDetails $details) {
    $this->fromH3mGuardedPrompt($obj, $details);

    // XXX=R:hhsi:
    $artifact = $this->spells->atCoords($details->spell, 0, 0, 'scroll');

    if (provided($artifact)) {
      $effects = [
        'artifacts' => [new ObjectArtifact(compact('artifact'))],
      ];

      if ($obj->garrison) {
        // ADVEVENT.TXT[8]
        // No audio in this message.
        $effects['message'] = "Victorious, you take your prize, `{Bonuses`}.\n\n`{BonusesImages`}";
      }

      $this->effects($this->bonusEffects($effects, $obj->id));
    } else {
      $this->warning("%s has no associated \$scroll Artifact", get_class($details));
    }
  }

  protected function fromH3m_Resource(AObject $obj, H3M\ObjectDetails $details) {
    $this->fromH3mGuardedPrompt($obj, $details);

    if (isset($details->resource)) {
      $obj->subclass = $this->const('resources.'.$this->known($details, 'resource'));

      if (isset($details->quantity)) {
        $resource = ['resources' => [$obj->subclass => $details->quantity]];
        $this->effects($this->bonusEffects($resource, [
          'ifBonusObject' => $obj->id,
           // Override random bonus specified by the object class.
           'stack' => [$this->const('effect.stack.resource'), 1],
        ]));
      }
    } else {    // Random Resource
      $obj->randomQuantity = $details->quantity;  // int, null
    }
  }

  protected function fromH3m_WitchHut(AObject $obj, H3M\ObjectDetails $details) {
    if ($details->potentialSkills) {  // match Skill->$id
      // Override default ifBonusObjectClass' quest_chances.
      // 'wk_$' labels are defined in databank-objects.php.
      $this->effect(['quest_chances', [$this->o_const, array_fill_keys(preg_replace('/^/', 'wk_', $details->potentialSkills), 1)], 'ifBonusObject' => $obj->id]);
    }
  }

  protected function fromH3m_SeerHut(AObject $obj, H3M\ObjectDetails $details) {
    if (!empty($details->recurring)) {
      $this->warning('unsupported HotA %s value of %s #%d, ignoring',
        '$recurring', get_class($details), $obj->id);
    }

    $this->fromH3m_QuestGuard($obj, $details, [
      'quest' => static::$seerHutQuest,
      'progress' => static::$seerHutProgress,
      'complete' => static::$seerHutComplete,
      'deadlineIfNoQuest' => true,
      'audio' => 'QUEST',
    ]);

    if ($reward = $details->reward) {
      $this->effects($this->fromH3mReward($reward, [], $obj));

      $format = function (&$s) use ($reward) {
        $s .= "\n\n";

        // XXX hardcoding numbers of the original reward; they may be changed by Effects but we don't know actual numbers at this point because the message (prompt) appears before giving out bonuses (filling addedBonuses); not sure if this should be fixed at all since it might be expected, plus the only way to do it is to carry out a fake _handle_bonus() session
        switch (get_class($reward)) {
          case H3M\Reward_Experience::class:
            return $s .= "`<`{StatImage experience`} $reward->experience`>";
          case H3M\Reward_SpellPoints::class:
            return $s .= "`<`{StatImage spellPoints`} $reward->spellPoints Spell Points`>";
          case H3M\Reward_Morale::class:
            // XXX=IC: hhlm: SoD shows 1 icon of +1 morale no matter the number; we show 3 +1 icons in classic mode
            return $s .= "`{MoraleImage $reward->morale`}";
          case H3M\Reward_Luck::class:
            // XXX=IC:hhlm:
            return $s .= "`{LuckImage $reward->luck`}";
          case H3M\Reward_Resource::class:
            if (is_string($reward->resource)) {
              $s .= "`{ResourceImage $reward->resource`, $reward->quantity`}";
            }
            return;
          case H3M\Reward_PrimarySkill::class:
            if (is_string($reward->skill)) {
              $name = ucfirst($reward->skill);
              in_array($name, ['Attack', 'Defense']) and $name .= ' Skill';
              $s .= "`<`{StatImage $reward->skill`} +$reward->change $name`>";
            }
            return;
          case H3M\Reward_Skill::class:
            if (is_string($reward->skill->level)) {
              $name = ucfirst($reward->skill->level).' '.$this->skills->atCoords($reward->skill->skill, 0, 0, 'name');
              $s .= "`<`{SkillImage {$reward->skill->skill}`, {$reward->skill->level}`} $name`>";
            }
            return;
          case H3M\Reward_Artifact::class:
            $name = $this->artifacts->atCoords($reward->artifact->artifact, 0, 0, 'name');
            return $s .= "`<`{ArtifactImage {$reward->artifact->artifact}`} $name`>";
          case H3M\Reward_Spell::class:
            return $s .= "`{SpellImage $reward->spell`}";
          case H3M\Reward_Creature::class:
            $name = $this->creatures->atCoords($reward->creature->creature, 0, 0, $reward->creature->count === 1 ? 'nameSingular' : 'namePlural');
            return $s .= "`<`{CreatureImage {$reward->creature->creature}`} {$reward->creature->count} $name`>";
        }
      };

      is_array($obj->completion) ? array_walk($obj->completion, $format) : $format($obj->completion);
    } else {
      // Editor allows this but nothing happens in-game when player agrees to
      // take the "reward".
      $this->warning("%s with undefined reward", get_class($details));
    }
  }

  protected function fromH3m_Scholar(AObject $obj, H3M\ObjectDetails $details) {
    // Null = random reward, will be determined on run-time (see
    // databank-objects.php).
    if ($details->reward) {
      $this->effects($this->fromH3mReward($details->reward, [], $obj));
      $obj->initialized[$this->const('object.initialized.random')] = true;
    }
  }

  protected function fromH3mReward(H3M\Reward $reward, array $selectors = [],
      AObject $obj = null) {
    $obj and $selectors['ifBonusObject'] = $obj->id;

    switch (get_class($reward)) {
      case H3M\Reward_Experience::class:
      case H3M\Reward_SpellPoints::class:
      case H3M\Reward_Morale::class:
      case H3M\Reward_Luck::class:
        $prop = lcfirst(substr(strrchr(get_class($reward), '_'), 1));
        return $this->bonusEffects([$prop => $reward->$prop], $selectors);
      case H3M\Reward_Resource::class:
        $res = $this->known($reward, 'resource', null);
        if (isset($res)) {
          return $this->bonusEffects([
            'resources' => [$this->const("resources.$res") => $reward->quantity],
          ], $selectors);
        }
        break;
      case H3M\Reward_PrimarySkill::class:
      case H3M\Reward_ScholarPrimarySkill::class:
        $stat = $this->known($reward, 'skill', null);
        if (isset($stat)) {
          return $this->bonusEffects([
            $stat => $reward->change ?? +1 /*scholar's*/,
          ], $selectors);
        }
        break;
      case H3M\Reward_Skill::class:
        return $this->bonusEffects(['skills' => [$reward->skill]], $selectors);
      case H3M\Reward_ScholarSkill::class:
        // Unlike with Reward_Skill, if the hero already has the skill, its
        // mastery level is increased instead of doing nothing.
        return $this->bonusEffects(['skillsImprove' => [$reward]], $selectors);
      case H3M\Reward_Artifact::class:
        return $this->bonusEffects([
          'artifacts' => $this->fromH3mArtifacts([$reward->artifact]),
        ], $selectors);
      case H3M\Reward_Spell::class:
        return $this->bonusEffects(['spells' => [$reward->spell]], $selectors);
      case H3M\Reward_Creature::class:
        return $this->bonusEffects([
          'garrison' => $this->fromH3mCreatures([$reward->creature]) ?: [],
        ], $selectors);
      default:
        $this->warnDetails($obj ?: reset($this->builder->objects), $reward);
    }

    return [];  // unknown resource, etc.
  }

  protected function fromH3m_Bank(AObject $obj, H3M\ObjectDetails $details) {
    if (isset($details->content) or isset($details->upgraded) or
        isset($details->artifacts)) {
      $this->warning('unsupported HotA feature(s) of %s #%d, ignoring',
        get_class($details), $obj->id);
    }
  }
}

function mergeInto(&$ref, ...$arrays) {
  return $ref = array_merge($ref ?: [], ...$arrays);
}

$_takeOver and (new CLI)->takeOver($argv);
